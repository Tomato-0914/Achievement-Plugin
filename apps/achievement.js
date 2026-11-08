import fs from 'node:fs'
import path from 'node:path'
import { getConfig, dataRoot, ensureDir, pluginName, pluginRoot, norm } from '../model/config.js'
import { renderPage } from '../model/render.js'
import { helpSections, importSteps, importWays, importNotes, helpText, importHelpText } from '../model/help.js'
import { getAchievements, syncAchievements, syncing, formatSync, scheduleAchievementSync } from '../model/data.js'
import { parseFile, parseText, parseJson } from '../model/importer.js'
import { loadRecord, applyImport, markIds, deleteRecord, toUiaf } from '../model/store.js'
import { mysAchievementCount, compareText } from '../model/mys.js'
import { pathToFileURL } from 'node:url'

/** 原神成就：录入、查漏、统计、查询。成就数据来自 genshin-db，见 model/data.js */

const GAME = 'gs'
const MAX_FILE = 10 * 1024 * 1024
const HELP_TPL = path.join(pluginRoot, 'resources', 'html', 'help.html')
const img = name => pathToFileURL(path.join(pluginRoot, 'resources', 'img', name)).href

/**
 * 成就徽章（透明底 PNG，resources/img/badge-<星数>-<亮几颗>.png）：
 * 单阶段成就 1 颗星，达成白、未达成暗；三阶段成就 3 颗星，第 k 阶段达成时亮 k 颗、没达成亮 k-1 颗。
 * 没录入成就时按达成显示
 */
function badgeOf (a, done) {
  if (a.stages >= 3) return img(`badge-3-${Math.max(0, Math.min(3, done ? a.stage : a.stage - 1))}.png`)
  return img(`badge-1-${done ? 1 : 0}.png`)
}
const fmtDate = sec => sec ? new Date(sec * 1000).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }) : ''

/** 成就行要用到的显示字段：是否达成、达成日期、徽章图 */
function decorate (a, rec) {
  const done = !!rec?.done.has(a.id)
  return { ...a, done, date: done ? fmtDate(rec.done.get(a.id)) : '', badge: badgeOf(a, done || !rec) }
}

const IMPORT_PROMPT = '请发送成就文件（json/xlsx/csv）或椰羊分享链接'

/** 贴进来的文字是不是一份存档（JSON，或者带 ID 表头的 CSV）；否则当作要标记的成就 ID / 名称 */
const looksLikeArchive = text => /^[[{]/.test(text) || /^\uFEFF?"?(id|编号)"?\s*[,\t]/i.test(text)

// 每页条数：默认 30，一页大约 3000 像素高，渲染出来正好一张图（超过 render.pageHeight 会被切成多张）
const pageSize = () => Math.max(10, Number(getConfig().pageSize) || 30)

/** 按大版本统计条数（新版本在前），列表太长时提示「按版本缩小范围」用 */
function versionBreakdown (list) {
  const count = new Map()
  for (const a of list) {
    const v = a.version ? `${a.version.split('.')[0]}.x` : ''
    if (v) count.set(v, (count.get(v) || 0) + 1)
  }
  return [...count].sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
}

/** 版本号比较：'7.2' > '7.10' 这种按数字比，不按字符串比 */
function cmpVersion (a, b) {
  const [a1 = 0, a2 = 0] = String(a).split('.').map(Number)
  const [b1 = 0, b2 = 0] = String(b).split('.').map(Number)
  return a1 - b1 || a2 - b2
}

/** 成就数据里最新的版本号（genshin-db 收录新版本后自动跟上） */
function latestVersion (data) {
  return data.list.reduce((best, a) => a.version && cmpVersion(a.version, best) > 0 ? a.version : best, '0.0')
}

/** 「版本新增」「当前版本」「7.2」「7.2版本」「7.2新增」→ 版本号（关键词取最新版本）；不是版本查询返回 '' */
function versionQuery (q, data) {
  const m = String(q).replace(/\s+/g, '').match(/^(?:(\d+\.\d+)(?:版本)?(?:新增)?(?:成就)?|版本新增|新增成就|最新版本|当前版本(?:新增)?|新版本)$/)
  if (!m) return ''
  return m[1] || latestVersion(data)
}

/** 「#成就查漏 天地万象 1.x（98）· 2.x（120）…」这样的一行提示 */
function versionTip (cmd, list) {
  const vs = versionBreakdown(list)
  if (vs.length < 2) return ''
  return `太多了翻不完，可以按版本看：${vs.map(([v, n]) => `<b>${v}</b>（${n}）`).join(' · ')}，比如 <b>${cmd} ${vs[0][0]}</b>`
}
/** 查漏、统计、录入时顺带和米游社的成就达成数核对（需要原神插件和绑定的 UID，查不到就不显示） */
const mysCompare = () => getConfig().mysCompare !== false

scheduleAchievementSync(GAME, Math.min(23, Math.max(0, Number(getConfig().syncHour) || 0)))


const fmtTime = ms => ms ? new Date(ms).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) : ''

/** 完成度：没全部完成时不四舍五入到 100% */
function percent (done, total) {
  if (!total) return '0'
  const p = Math.floor(done / total * 1000) / 10
  return String(done < total ? Math.min(p, 99.9) : 100)
}

function summarize (data, rec) {
  let done = 0
  let primoDone = 0
  let primoAll = 0
  for (const a of data.list) {
    primoAll += a.primo
    if (rec?.done.has(a.id)) {
      done++
      primoDone += a.primo
    }
  }
  const total = data.list.length
  // recorded：记录里的全部 ID 数（含成就数据里还没有的新成就），和米游社的达成数比较用
  return { done, total, missing: total - done, pct: percent(done, total), primoDone, primoMissing: primoAll - primoDone, recorded: rec?.done.size || 0 }
}

/** 按特辑分组：groups 里每项带 done/total/missing/primoMissing，items 是传入的成就 */
function groupItems (data, items, rec) {
  // 分组卡片按成就在列表里第一次出现的顺序排（列表已经排好序了，比如查询按版本排），组内保持列表顺序
  const pick = new Map()
  for (const a of items) {
    if (!pick.has(a.groupId)) pick.set(a.groupId, [])
    pick.get(a.groupId).push(a)
  }
  const byId = new Map(data.groups.map(g => [g.id, g]))
  return [...pick].filter(([id]) => byId.has(id)).map(([id, list]) => ({ ...groupProgress(data, byId.get(id), rec), items: list }))
}

function groupProgress (data, g, rec) {
  let done = 0
  let primoMissing = 0
  for (const a of data.list) {
    if (a.groupId !== g.id) continue
    if (rec?.done.has(a.id)) done++
    else primoMissing += a.primo
  }
  return { name: g.name, id: g.id, total: g.total, done, missing: g.total - done, primoMissing, pct: percent(done, g.total) }
}

/** 特辑关键词 → 特辑列表：完全一致优先，其次包含（比如「至冬」匹配到两个至冬特辑） */
function findGroups (data, q) {
  const k = norm(q)
  if (!k) return []
  const exact = data.groups.filter(g => norm(g.name) === k)
  return exact.length ? exact : data.groups.filter(g => norm(g.name).includes(k))
}

/** 名称或 ID → 成就列表 */
function resolve (data, q) {
  q = String(q).trim()
  if (/^\d{5,6}$/.test(q)) return data.byId.has(Number(q)) ? [data.byId.get(Number(q))] : []
  const k = norm(q)
  return k ? data.list.filter(a => norm(a.title) === k) : []
}

/** 关键词搜索：ID → 名称完全一致 → 名称包含 → 描述包含 */
function search (data, q) {
  const exact = resolve(data, q)
  if (exact.length) return exact
  const k = norm(q)
  if (!k) return []
  const byTitle = data.list.filter(a => norm(a.title).includes(k))
  return byTitle.length ? byTitle : data.list.filter(a => norm(a.desc).includes(k))
}

/** 成就显示名：多阶段成就带上第几阶段，如「动物园大亨（1/3）」 */
const label = a => a ? (a.stages > 1 ? `${a.title}（${a.stage}/${a.stages}）` : a.title) : ''

const who = e => {
  const name = e.sender?.card || e.sender?.nickname || ''
  return name ? `${name}` : `用户 ${e.user_id}`
}

/** 图片超过 1 张时合并转发 */
/**
 * 按钮：只有 QQ 官方 Bot（QQBot 适配器）支持，其他适配器（icqq、OneBot 等）不加；配置 buttons: false 可以关掉。
 * 录入、查询是输入按钮（填进输入框，用户补完再发），其余是回调按钮（点了直接执行）
 */
const BTN = {
  录入: { text: '录入', input: '#成就录入' },
  查询: { text: '查询', input: '#成就查询 ' },
  查漏: { text: '查漏', callback: '#成就查漏' },
  统计: { text: '统计', callback: '#成就统计' },
  导出: { text: '导出', callback: '#成就导出' }
}
const BUTTONS = {
  help: [['录入', '查询'], ['查漏', '统计', '导出']],
  missing: [['查漏', '统计', '导出']],
  query: [['查询', '查漏', '统计']],
  stats: [['查询', '查漏', '统计']]
}
function buttonsOf (e, kind) {
  if (getConfig().buttons === false || !BUTTONS[kind]) return null
  if (e?.bot?.adapter?.id !== 'QQBot' || typeof segment === 'undefined' || typeof segment.button !== 'function') return null
  return segment.button(...BUTTONS[kind].map(row => row.map(k => BTN[k])))
}

/** 发图：一张直接发（带按钮的话一起发）；多张合并转发，按钮另发一条 */
async function sendImages (e, imgs, title, buttons = null) {
  const msgs = imgs.map(buf => segment.image(buf))
  if (msgs.length <= 1) return e.reply(buttons ? [msgs[0], buttons] : msgs[0])
  let sent = false
  try {
    if (typeof Bot !== 'undefined' && typeof Bot.makeForwardArray === 'function') {
      await e.reply(await Bot.makeForwardArray(msgs))
    } else {
      const { default: common } = await import('../../../lib/common/common.js')
      await e.reply(await common.makeForwardMsg(e, msgs, title))
    }
    sent = true
  } catch (err) {
    logger.warn(`[${pluginName}] 合并转发失败，改为逐条发送：${err.message}`)
  }
  if (!sent) for (const m of msgs) await e.reply(m)
  if (buttons) await e.reply(buttons)
  return true
}

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

export class Achievement extends plugin {
  constructor () {
    const cfg = getConfig()
    super({
      name: '原神成就',
      dsc: '原神成就录入、查漏、统计、查询',
      event: 'message',
      // 默认 -110，比观测枢图鉴（-100）靠前：#成就图鉴 之类的消息别被图鉴的模糊匹配接走
      priority: cfg.priority ?? -110,
      rule: [
        { reg: '^#(原神)?成就(帮助|菜单|help|功能|图鉴)$', fnc: 'help' },
        { reg: '^#(原神)?成就(录入|导入)(帮助|教程|说明)$', fnc: 'importHelp' },
        { reg: '^#(原神)?成就(数据)?(强制)?更新$', fnc: 'sync', permission: 'master' },
        { reg: '^#(原神)?成就(取消|撤销)(录入|完成|标记)?\\s*(.*)$', fnc: 'markUndone' },
        { reg: '^#(原神)?成就(录入|导入|上传)([\\s\\S]*)$', fnc: 'importCmd' },
        { reg: '^#(原神)?成就(查漏|缺失|未完成)(.*)$', fnc: 'missing' },
        { reg: '^#(原神)?(我的)?成就(统计|进度|总览)?$', fnc: 'stats' },
        // 旧写法，帮助里不再写，留着兼容：#成就完成 xxx 等于 #成就录入 xxx
        { reg: '^#(原神)?成就(完成|标记|打卡)\\s*(.+)$', fnc: 'markDone' },
        { reg: '^#(原神)?成就导出$', fnc: 'exportCmd' },
        { reg: '^#(原神)?成就(对比|核对|校对)$', fnc: 'compare' },
        { reg: '^#(原神)?(清空|删除)(我的)?成就(记录|存档)$', fnc: 'clear' },
        { reg: '^#(原神)?成就(查询|搜索|查找)?\\s*(.+)$', fnc: 'query' }
      ]
    })
  }

  /** 成就数据；还没同步过时顺手开始同步并提示 */
  async data () {
    const data = getAchievements(GAME)
    if (data) return data
    if (!syncing(GAME)) syncAchievements(GAME).catch(err => logger.warn(`[${pluginName}] 成就数据同步失败：${err.message}`))
    await this.reply('成就数据还没同步完成（首次需要一两分钟从 genshin-db 下载），请稍后再试')
    return null
  }

  /** 帮助图；渲染失败时退回纯文字（每行不以 # 开头，免得 QQ 官方 Bot 当成 Markdown 标题） */
  async help () {
    return this.helpImage('help', helpText)
  }

  async importHelp () {
    return this.helpImage('import', importHelpText)
  }

  async helpImage (mode, fallback) {
    const data = getAchievements(GAME)
    let version = ''
    try {
      version = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8')).version || ''
    } catch {}
    try {
      const imgs = await renderPage(`help_${mode}`, {
        title: mode === 'import' ? '成就录入帮助' : '成就帮助',
        mode,
        sections: helpSections,
        steps: importSteps,
        ways: importWays,
        notes: importNotes,
        total: data?.list.length || 0,
        syncedAt: fmtTime(data?.syncedAt),
        trophy: img('trophy.png'),
        version
      }, HELP_TPL)
      return sendImages(this.e, imgs, '成就帮助', buttonsOf(this.e, 'help'))
    } catch (err) {
      logger.error(err)
      return this.reply(fallback())
    }
  }

  async sync () {
    const force = this.e.msg.includes('强制')
    await this.reply(`开始${force ? '重新下载全部' : '同步'}成就数据…`)
    try {
      return this.reply(formatSync(await syncAchievements(GAME, { force })))
    } catch (err) {
      return this.reply(`成就数据同步失败：${err.message}`)
    }
  }

  // ---------- 录入 ----------

  /**
   * #成就录入：
   * - 什么都不带：等用户发文件（2 分钟）
   * - 带文件、椰羊分享链接、文件链接、JSON / CSV 文本：当作存档导入
   * - 带成就 ID 或成就名：把这些成就标记为已完成（#成就取消录入 撤销）
   */
  async importCmd () {
    const text = this.e.msg.replace(/^#(原神)?成就(录入|导入|上传)/, '').trim()
    if (await this.tryImport(text)) return true
    if (text) return this.mark(true, text)
    this.setContext('importContext', false, 120)
    return this.reply(IMPORT_PROMPT)
  }

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

    const data = await this.data()
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

  // ---------- 查漏 / 统计 / 查询 ----------

  /** #成就查漏 [特辑] [版本] [隐藏] [页码] */
  async missing () {
    const data = await this.data()
    if (!data) return true
    const rec = loadRecord(GAME, this.e.user_id)
    if (!rec) return this.reply('你还没有录入成就，发送 #成就录入 导入椰羊等工具导出的存档')

    let arg = this.e.msg.replace(/^#(原神)?成就(查漏|缺失|未完成)/, '').trim()
    let page = 1
    const pm = arg.match(/(?:^|\s|第)(\d{1,3})\s*页?$/)
    if (pm && !/\d+\.\d*$/.test(arg)) {
      page = Math.max(1, Number(pm[1]))
      arg = arg.slice(0, pm.index).trim()
    }
    let version = ''
    arg = arg.replace(/(\d+)\.(\d+|x)\s*(版本)?/i, (_, a, b) => { version = `${a}.${b.toLowerCase()}`; return ' ' }).trim()
    let hiddenOnly = false
    arg = arg.replace(/隐藏(成就)?/, () => { hiddenOnly = true; return ' ' }).trim()

    let pool = data.list.filter(a => !rec.done.has(a.id))
    const conds = []
    if (arg) {
      const groups = findGroups(data, arg)
      if (!groups.length) return this.reply(`没有找到特辑「${arg}」，发送 #成就统计 可以看全部特辑`)
      const ids = new Set(groups.map(g => g.id))
      pool = pool.filter(a => ids.has(a.groupId))
      conds.push(`特辑 <b>${groups.map(g => g.name).join('、')}</b>`)
    }
    if (version) {
      pool = pool.filter(a => version.endsWith('.x') ? a.version.split('.')[0] === version.split('.')[0] : a.version === version)
      conds.push(`版本 <b>${version}</b>`)
    }
    if (hiddenOnly) {
      pool = pool.filter(a => a.hidden)
      conds.push('<b>隐藏成就</b>')
    }

    const size = pageSize()
    const pages = Math.max(1, Math.ceil(pool.length / size))
    if (page > pages) return this.reply(`一共只有 ${pages} 页`)
    const items = pool.slice((page - 1) * size, page * size)
    const primo = pool.reduce((n, a) => n + a.primo, 0)
    const filterParts = []
    if (conds.length) filterParts.push(`筛选：${conds.join(' · ')}`)
    if (conds.length || pages > 1) filterParts.push(`共 <b>${pool.length}</b> 个未完成，<b>${primo}</b> 原石`)

    const tips = []
    const base = `#成就查漏${arg ? ` ${arg}` : ''}`
    if (pages > page) tips.push(`下一页发送 <b>${base}${version ? ` ${version}` : ''}${hiddenOnly ? ' 隐藏' : ''} ${page + 1}</b>`)
    // 超过 2 页还没按版本筛：列出各大版本的条数，一步缩小范围
    if (pages > 2 && !version) {
      const vt = versionTip(base, pool)
      if (vt) tips.push(vt)
    }
    if (!arg && pages > 2) tips.push('也可以按特辑查：<b>#成就查漏 天地万象</b>、<b>#成就查漏 至冬</b>')
    tips.push('完成了可以发 <b>#成就录入 ID</b> 标记，或者重新 <b>#成就录入</b> 最新存档')

    return this.renderSend('missing', {
      mode: 'missing',
      title: '成就查漏',
      filter: filterParts.join('；'),
      pager: pages > 1 ? { page, pages, count: pool.length } : null,
      groups: groupItems(data, items, rec).map(g => ({ ...g, items: g.items.map(a => decorate(a, rec)) })),
      empty: conds.length ? '这个范围内的成就都完成啦' : '全部成就都完成啦！',
      tips
    }, data, rec)
  }

  async stats () {
    const data = await this.data()
    if (!data) return true
    const rec = loadRecord(GAME, this.e.user_id)
    if (!rec) return this.reply('你还没有录入成就，发送 #成就录入帮助 看怎么导出存档')
    return this.renderSend('stats', {
      mode: 'stats',
      title: '成就统计',
      // 没完成的特辑排前面，全部完成的放后面
      sections: (() => {
        const all = data.groups.map(g => groupProgress(data, g, rec))
        const todo = all.filter(g => g.missing)
        const full = all.filter(g => !g.missing)
        return [
          todo.length && { title: `未完成的特辑（${todo.length}）`, groups: todo },
          full.length && { title: `已全部完成（${full.length}）`, groups: full }
        ].filter(Boolean)
      })(),
      tips: ['发送 <b>#成就查漏</b> 看没完成的成就；只看某个特辑发 <b>#成就查漏 特辑名</b>，太多的话再加版本，如 <b>#成就查漏 天地万象 6.x</b>']
    }, data, rec)
  }

  async query () {
    const m = this.e.msg.match(/^#(原神)?成就(查询|搜索|查找)?\s*(.+)$/)
    const explicit = !!m?.[2]
    let q = m?.[3]?.trim() || ''
    // 「#成就查询 天地万象 2」：末尾 1~3 位数字是页码（成就 ID 是 5~6 位，不会混）
    let page = 1
    const pm = explicit && q.match(/^(.+?)\s+(?:第\s*)?(\d{1,3})\s*页?$/)
    if (pm) {
      q = pm[1].trim()
      page = Math.max(1, Number(pm[2]))
    }
    if (!q || q.length > 30) return false
    // 不带「查询」的 #成就xxx：只认 ID、完整的成就名或特辑名，对不上就放行，免得抢了别的插件的指令
    const data = explicit ? await this.data() : getAchievements(GAME)
    if (!data) return explicit

    const rec = loadRecord(GAME, this.e.user_id)
    // ID / 完整成就名 → 特辑名（完整或部分，如「至冬」）→ 成就名包含 → 描述包含；不带「查询」时只认前两种完整写法
    const groups = findGroups(data, q)
    const exactGroup = groups.length === 1 && norm(groups[0].name) === norm(q)
    const inGroups = gs => data.list.filter(a => gs.some(g => g.id === a.groupId))
    // 「#成就查询 版本新增」/「#成就版本新增」：最新版本新增的成就；「#成就查询 7.1」：指定版本
    const ver = versionQuery(q, data)
    let list = ver ? data.list.filter(a => a.version === ver) : resolve(data, q)
    if (ver && !list.length) return this.reply(`没有 ${ver} 版本新增的成就数据`)
    let byGroup = false
    if (!list.length && (exactGroup || (explicit && groups.length))) {
      list = inGroups(groups)
      byGroup = true
    }
    if (!list.length && explicit) list = search(data, q)
    if (!list.length) return explicit ? this.reply(`没找到和「${q}」有关的成就`) : false
    // 排序（在分页之前排）：录入过成就的，没达成的排最前面；再按版本号从旧到新，同版本保持游戏里的顺序（多阶段成就挨在一起）
    const byVer = arr => arr.map((a, i) => [a, i]).sort((x, y) => cmpVersion(x[0].version || '0', y[0].version || '0') || x[1] - y[1]).map(([a]) => a)
    list = rec ? [...byVer(list.filter(a => !rec.done.has(a.id))), ...byVer(list.filter(a => rec.done.has(a.id)))] : byVer(list)

    // 一律出图，排版照游戏里的成就列表：徽章、名称描述、原石、达成状态（有完成时间的显示日期）
    const size = pageSize()
    const pages = Math.max(1, Math.ceil(list.length / size))
    if (page > pages) return this.reply(`一共只有 ${pages} 页`)
    const shown = list.slice((page - 1) * size, page * size)
    const tips = []
    if (pages > page) tips.push(`下一页发送 <b>#成就查询 ${q} ${page + 1}</b>`)
    // 查整个特辑又很多页：提示只看没完成的
    if (pages > 2 && byGroup && rec) tips.push(`只看没完成的发 <b>#成就查漏 ${q}</b>，还可以加版本缩小范围，如 <b>#成就查漏 ${q} 6.x</b>`)
    if (ver && rec && list.some(a => !rec.done.has(a.id))) tips.push(`只看这个版本没完成的发 <b>#成就查漏 ${ver}</b>`)
    if (!rec) tips.push('录入成就后可以看到每个成就是否达成：<b>#成就录入</b>')
    const safeQ = q.replace(/[<>&"]/g, '')
    return this.renderSend('query', {
      mode: 'query',
      title: `成就查询·${ver ? `${ver} 版本新增` : safeQ}`,
      sub: '',
      pager: pages > 1 ? { page, pages, count: list.length } : null,
      right: rec ? { big: list.filter(a => rec.done.has(a.id)).length, total: list.length, label: `共 ${list.length} 个 · 已达成` } : null,
      // 分组标题的进度只算这次查到的成就（所有页），不是整个特辑，免得和下面列出来的对不上
      groups: groupItems(data, shown, rec).map(g => {
        const hit = list.filter(a => a.groupId === g.id)
        return { ...g, total: hit.length, done: rec ? hit.filter(a => rec.done.has(a.id)).length : 0, items: g.items.map(a => decorate(a, rec)) }
      }),
      tips,
      fallback: () => shown.slice(0, 5).map(a => this.textOf(a, rec)).join('\n\n')
    }, data, rec, { mys: false })
  }

  /** 出图失败时的纯文字兜底 */
  textOf (a, rec) {
    const tags = [a.group, a.stages > 1 ? `第 ${a.stage}/${a.stages} 阶段` : '', a.hidden ? '隐藏成就' : '', a.version ? `${a.version} 版本` : ''].filter(Boolean)
    const lines = [`【${a.title}】#${a.id}`, tags.join(' · '), a.desc, `奖励：原石 ×${a.primo}`]
    if (rec) lines.push(`状态：${rec.done.has(a.id) ? '✅ 已完成' : '❌ 未完成'}`)
    return lines.join('\n')
  }

  /** 查漏、统计图上的米游社核对结果；关掉了、没记录或查不到时返回 null */
  async mysView (rec) {
    if (!rec || !mysCompare()) return null
    const mys = await mysAchievementCount(this.e, { silent: true })
    return mys.error ? null : { ...mys, ...compareText(mys.count, rec.done.size) }
  }

  /** 查漏 / 查询 / 统计出图（共用 resources/html/achievement.html）；mys 为 false 时不核对米游社 */
  async renderSend (id, view, data, rec, { mys: withMys = true } = {}) {
    const { fallback, ...rest } = view
    // 出图要一两秒（还可能先查米游社），先回一句；配置 renderTip: false 关掉
    if (getConfig().renderTip !== false) await this.reply('查询中，请稍等...')
    try {
      // 先核对米游社（10 分钟内有缓存；静默查询最多等 8 秒，查不到就不显示），再出图
      const mys = withMys ? await this.mysView(rec) : null
      const summary = summarize(data, rec)
      const imgs = await renderPage(id, {
        sub: who(this.e).replace(/[<>&"]/g, ''),
        summary,
        right: { big: summary.done, total: summary.total, label: `完成度 ${summary.pct}%` },
        hasRecord: !!rec,
        trophy: img('trophy.png'),
        primo: img('primo.png'),
        totalAll: data.list.length,
        syncedAt: fmtTime(data.syncedAt),
        updatedAt: fmtTime(rec?.updatedAt),
        mys,
        ...rest
      })
      return sendImages(this.e, imgs, view.title, buttonsOf(this.e, view.mode))
    } catch (err) {
      logger.error(err)
      return this.reply(fallback ? fallback() : `${view.title}图片生成失败：${err.message}`)
    }
  }

  // ---------- 手动标记 / 导出 / 清空 ----------

  async markDone () {
    return this.mark(true, this.e.msg.replace(/^#(原神)?成就(完成|标记|打卡)/, ''))
  }

  async markUndone () {
    const arg = this.e.msg.replace(/^#(原神)?成就(取消|撤销)(录入|完成|标记)?/, '').trim()
    if (!arg) return this.reply('写上要取消的成就 ID 或名称，比如：#成就取消录入 81622')
    return this.mark(false, arg)
  }

  async mark (done, arg) {
    const data = await this.data()
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

  async exportCmd () {
    const data = await this.data()
    if (!data) return true
    const rec = loadRecord(GAME, this.e.user_id)
    if (!rec) return this.reply('你还没有录入成就')
    const dir = ensureDir(path.join(dataRoot, GAME, 'export'))
    const file = path.join(dir, `uiaf_${String(this.e.user_id).replace(/[^\w-]/g, '_')}.json`)
    let ver = ''
    try {
      ver = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8')).version || ''
    } catch {}
    fs.writeFileSync(file, JSON.stringify(toUiaf(rec, data, ver)))
    try {
      if (typeof segment !== 'undefined' && typeof segment.file === 'function') {
        await this.reply(segment.file(file, `成就UIAF_${new Date().toISOString().slice(0, 10)}.json`))
        return true
      }
      if (this.e.isGroup && typeof this.e.group?.sendFile === 'function') return await this.e.group.sendFile(file)
      if (typeof this.e.friend?.sendFile === 'function') return await this.e.friend.sendFile(file)
    } catch (err) {
      logger.warn(`[${pluginName}] 发送成就导出文件失败：${err.message}`)
    }
    return this.reply('当前适配器不支持发送文件，请联系主人到 data 目录下取出导出文件')
  }

  /** #成就对比：和米游社的成就达成数核对；绑定 UID、Cookie 之类的提示由原神插件自己回复 */
  async compare () {
    const rec = loadRecord(GAME, this.e.user_id)
    const mys = await mysAchievementCount(this.e, { force: true })
    if (mys.error) {
      // 原神插件已经回复过「请先#绑定uid」等提示的，这里不再重复
      if (/原神插件|超时/.test(mys.error)) return this.reply(`查不到米游社数据：${mys.error}`)
      return true
    }
    if (!rec) return this.reply(`米游社显示已达成 ${mys.count} 个，你还没有录入成就`)
    return this.reply(compareText(mys.count, rec.done.size).text)
  }

  async clear () {
    return this.reply(deleteRecord(GAME, this.e.user_id) ? '已删除你的成就记录' : '你还没有成就记录')
  }
}
