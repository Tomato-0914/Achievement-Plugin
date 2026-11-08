import fs from 'node:fs'
import { getConfig } from '../model/config.js'
import { parseFile, parseText, parseJson } from '../model/importer.js'
import { loadRecord, applyImport, markIds } from '../model/store.js'
import { mysAchievementCount, compareText } from '../model/mys.js'
import { GAME, mysCompare, summarize, resolve, label } from '../model/achievement.js'
import { ensureData } from '../model/reply.js'

/**
 * 录入：
 * - #成就录入：什么都不带时等用户发文件（2 分钟）；带文件、椰羊分享链接、文件链接、JSON / CSV 文本时整份导入
 * - #成就录入 ID或名称：把这些成就标记为已完成；#成就取消录入 撤销
 */

const MAX_FILE = 10 * 1024 * 1024
const IMPORT_PROMPT = '请发送成就文件（json/xlsx/csv）或椰羊分享链接'

/** 贴进来的文字是不是一份存档（JSON，或者带 ID 表头的 CSV）；否则当作要标记的成就 ID / 名称 */
const looksLikeArchive = text => /^[[{]/.test(text) || /^﻿?"?(id|编号)"?\s*[,\t]/i.test(text)

/** 消息里的文件段 → 下载地址（官方 Bot / OneBot 直接带 url；icqq 要用 fid 换） */
async function fileUrl (e, seg) {
  for (const v of [seg.url, seg.file]) if (typeof v === 'string' && /^https?:\/\//.test(v)) return v
  const fid = seg.fid || seg.file_id
  const target = e.isGroup ? e.group : e.friend
  if (fid && typeof target?.getFileUrl === 'function') return target.getFileUrl(fid)
  for (const v of [seg.path, seg.file]) if (typeof v === 'string' && fs.existsSync(v)) return v
  return ''
}

async function download (url) {
  if (!/^https?:\/\//.test(url)) return fs.readFileSync(url)
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`)
  const len = Number(res.headers.get('content-length'))
  if (len > MAX_FILE) throw new Error('文件太大了（超过 10MB），不像是成就存档')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_FILE) throw new Error('文件太大了（超过 10MB），不像是成就存档')
  return buf
}

/** 当前消息、以及它回复的那条消息里的文件段 */
async function fileSegments (e) {
  const segs = (Array.isArray(e.message) ? e.message : []).filter(m => m?.type === 'file')
  if (segs.length) return segs
  try {
    const reply = typeof e.getReply === 'function' ? await e.getReply() : null
    return (Array.isArray(reply?.message) ? reply.message : []).filter(m => m?.type === 'file')
  } catch {
    return []
  }
}

/**
 * 椰羊分享链接：YaeAchievement 选「椰羊」导出、或者在椰羊网页上分享时，会得到
 * https://cocogoat.work/achievement?memo=xxxxxxxxx 这样的链接，memo 是 9 位的分享码。
 * 椰羊网页自己就是从 77.cocogoat.cn/v2/memo/<分享码> 取回 UIAF 数据的，这里照做，用户不用传文件
 */
const MEMO_LINK = /cocogoat\.(?:work|cn)\/achievement\/?\?(?:[^\s#]*&)?memo=([A-Za-z0-9]{9})(?![A-Za-z0-9])/
const MEMO_APIS = ['https://77.cocogoat.cn', 'https://77.cocogoat.work']

function memoKey (text) {
  const m = String(text).match(MEMO_LINK)
  if (m) return m[1]
  // 只发分享码本身：9 位字母数字，至少带一个字母（和成就 ID 区分开）
  return /^[A-Za-z0-9]{9}$/.test(text) && /[A-Za-z]/.test(text) ? text : ''
}

async function fetchMemo (key) {
  let lastErr
  for (const api of MEMO_APIS) {
    try {
      const res = await fetch(`${api}/v2/memo/${key}`, { signal: AbortSignal.timeout(20000) })
      if (res.status === 404) throw new Error('分享链接不存在或已过期，请重新导出')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      lastErr = err
    }
  }
  throw new Error(`椰羊分享链接读取失败：${lastErr?.message}`)
}

export class AchievementImport extends plugin {
  constructor () {
    super({
      name: '原神成就-录入',
      dsc: '成就录入（文件 / 链接 / 手动标记）、取消录入',
      event: 'message',
      priority: getConfig().priority ?? -110,
      rule: [
        { reg: '^#(原神)?成就(取消|撤销)(录入|完成|标记)?\\s*(.*)$', fnc: 'markUndone' },
        // 「#成就录入帮助」归帮助管，这里排除掉
        { reg: '^#(原神)?成就(录入|导入|上传)(?!(?:帮助|教程|说明)$)([\\s\\S]*)$', fnc: 'importCmd' },
        // 旧写法，帮助里不再写，留着兼容：#成就完成 xxx 等于 #成就录入 xxx
        { reg: '^#(原神)?成就(完成|标记|打卡)\\s*(.+)$', fnc: 'markDone' }
      ]
    })
  }

  async importCmd () {
    const text = this.e.msg.replace(/^#(原神)?成就(录入|导入|上传)/, '').trim()
    if (await this.tryImport(text)) return true
    if (text) return this.mark(true, text)
    this.setContext('importContext', false, 120)
    return this.reply(IMPORT_PROMPT)
  }

  /** 等文件的 2 分钟里收到的消息 */
  async importContext () {
    const e = this.e
    const text = typeof e.msg === 'string' ? e.msg.trim() : ''
    if (/^#?(取消|算了|退出)$/.test(text)) {
      this.finish('importContext')
      return this.reply('已取消成就录入')
    }
    // 发了别的指令：退出录入，免得一直卡在这里
    if (/^[#/]/.test(text) && !/^#(原神)?成就(录入|导入|上传)/.test(text)) {
      this.finish('importContext')
      return this.reply('已退出成就录入，需要时再发 #成就录入')
    }
    const rest = text.replace(/^#(原神)?成就(录入|导入|上传)/, '').trim()
    if (await this.tryImport(rest)) {
      this.finish('importContext')
      return true
    }
    // 等文件的时候又发了 #成就录入 ID：照常标记
    if (rest && rest !== text) {
      this.finish('importContext')
      return this.mark(true, rest)
    }
    return this.reply(`没收到文件，${IMPORT_PROMPT}，发「取消」退出`)
  }

  /** 从当前消息里找文件 / 链接 / 文本并导入；什么都没有返回 false */
  async tryImport (text) {
    const e = this.e
    let parsed
    let from = ''
    try {
      const segs = await fileSegments(e)
      if (segs.length) {
        const seg = segs[0]
        const url = await fileUrl(e, seg)
        if (!url) throw new Error('当前适配器拿不到文件下载地址，可以改发椰羊分享链接（见 #成就录入帮助）')
        from = seg.name || '文件'
        parsed = parseFile(await download(url), from)
      } else if (memoKey(text)) {
        from = '椰羊分享链接'
        parsed = parseJson(await fetchMemo(memoKey(text)))
      } else if (/^https?:\/\/\S+$/.test(text)) {
        from = '链接'
        parsed = parseFile(await download(text), text)
      } else if (looksLikeArchive(text)) {
        from = '文本'
        parsed = parseText(text)
      } else {
        return false
      }
    } catch (err) {
      await this.reply(`成就存档解析失败：${err.message}`)
      return true
    }

    const data = await ensureData(this)
    if (!data) return true
    if (!parsed.done.size && !parsed.undone.size) {
      await this.reply('没有识别到任何成就，请确认是椰羊导出的表格或 UIAF 格式的存档')
      return true
    }
    const { record, added, removed, unknown } = applyImport(GAME, e.user_id, parsed, data.byId, parsed.format)
    const sum = summarize(data, record)
    const lines = [
      `成就录入成功（${parsed.format}${from && from !== '文本' ? `，${from}` : ''}）`,
      parsed.replace ? `已按存档覆盖原有记录：新增完成 ${added} 个${removed ? `，取消 ${removed} 个` : ''}` : `追加完成 ${added} 个`,
      `当前进度 ${sum.done}/${sum.total}（${sum.pct}%），未完成 ${sum.missing} 个，还能拿 ${sum.primoMissing} 原石`
    ]
    if (unknown) lines.push(`有 ${unknown} 个 ID 不在当前成就数据里（可能是新版本成就，数据更新后会自动算上）`)
    if (mysCompare()) {
      const mys = await mysAchievementCount(e, { silent: true, force: true })
      if (!mys.error) lines.push(compareText(mys.count, record.done.size).text)
    }
    lines.push('发送 #成就查漏 查看未完成的成就')
    await this.reply(lines.join('\n'))
    return true
  }

  async markDone () {
    return this.mark(true, this.e.msg.replace(/^#(原神)?成就(完成|标记|打卡)/, ''))
  }

  async markUndone () {
    const arg = this.e.msg.replace(/^#(原神)?成就(取消|撤销)(录入|完成|标记)?/, '').trim()
    if (!arg) return this.reply('写上要取消的成就 ID 或名称，比如：#成就取消录入 81622')
    return this.mark(false, arg)
  }

  /** 按 ID / 名称标记完成或取消；多阶段成就同名，要写 ID */
  async mark (done, arg) {
    const data = await ensureData(this)
    if (!data) return true
    arg = arg.trim()
    // 整句先当成一个名称（有的成就名带空格），对不上再按空格、逗号拆开
    const tokens = resolve(data, arg).length ? [arg] : arg.split(/[\s,，、]+/).filter(Boolean)
    const ids = []
    const problems = []
    for (const t of tokens) {
      const hit = resolve(data, t)
      if (hit.length === 1) ids.push(hit[0].id)
      else if (hit.length > 1) problems.push(`「${t}」有 ${hit.length} 个阶段，请用 ID：${hit.map(a => `${a.id}（${a.desc}）`).join('；')}`)
      else problems.push(`没找到「${t}」${/^\d+$/.test(t) ? '' : '，可以先 #成就查询 关键词 找到 ID'}`)
    }
    const changed = ids.length ? markIds(GAME, this.e.user_id, ids, done) : []
    const lines = []
    if (changed.length) lines.push(`已${done ? '标记完成' : '取消完成'}：${changed.map(id => label(data.byId.get(id)) || id).join('、')}`)
    const same = ids.filter(id => !changed.includes(id))
    if (same.length) lines.push(`本来就${done ? '已完成' : '未完成'}：${same.map(id => label(data.byId.get(id)) || id).join('、')}`)
    lines.push(...problems)
    if (changed.length) {
      const sum = summarize(data, loadRecord(GAME, this.e.user_id))
      lines.push(`当前进度 ${sum.done}/${sum.total}（${sum.pct}%）`)
    }
    return this.reply(lines.join('\n'))
  }
}
