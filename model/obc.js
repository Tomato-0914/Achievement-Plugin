import fs from 'node:fs'
import path from 'node:path'
import { dataRoot, ensureDir, pluginName, norm } from './config.js'

/**
 * 米游社观测枢的成就图鉴（成就详情用）：
 * - 目录：blackboard 接口 home/content/list，channel_id=252 只返回「成就」这一类（约 1600 条：每个成就一条 + 每个特辑一条）
 * - 详情：hoyowiki 接口 entry_page，成就条目有「基础信息 / 详细信息 / 补充说明 / 攻略推荐」，特辑条目有「基础信息 / 成就列表」
 * 目录缓存 1 天、详情缓存 3 天（data/<插件名>/gs/obc/），接口挂了先用旧缓存
 */

const CATALOG_API = 'https://api-static.mihoyo.com/common/blackboard/ys_obc/v1/home/content/list?app_sn=ys_obc&channel_id=252'
const ENTRY_API = id => `https://api-takumi.mihoyo.com/hoyowiki/genshin/wapi/entry_page?app_sn=ys_obc&lang=zh-cn&entry_page_id=${encodeURIComponent(id)}`
const HEADERS = { Referer: 'https://baike.mihoyo.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' }
const CATALOG_TTL = 86400 * 1000
const ENTRY_TTL = 3 * 86400 * 1000

const dir = game => path.join(dataRoot, game, 'obc')

async function getJson (url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json?.retcode !== 0) throw new Error(`retcode=${json?.retcode} ${json?.message || ''}`.trim())
  return json.data
}

function readCache (file, ttl) {
  try {
    const age = Date.now() - fs.statSync(file).mtimeMs
    return { data: JSON.parse(fs.readFileSync(file, 'utf8')), fresh: age < ttl }
  } catch {
    return null
  }
}

function writeCache (file, data) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(data))
}

/** 带缓存的请求：新鲜的直接用；过期了重新拉，拉不到先用旧的 */
async function cached (file, ttl, load) {
  const c = readCache(file, ttl)
  if (c?.fresh) return c.data
  try {
    const data = await load()
    writeCache(file, data)
    return data
  } catch (err) {
    if (c) {
      logger.warn(`[${pluginName}] 观测枢接口请求失败，先用旧缓存：${err.message}`)
      return c.data
    }
    throw err
  }
}

// ---------- 目录 ----------

/** 目录条目的筛选标签：{"c_252":{"filter":{"text":"[\"成就集/对决者\",\"上线版本/5.5\"]"}}} → { 成就集: '对决者', 上线版本: '5.5' } */
function tagsOf (ext) {
  const out = {}
  try {
    const obj = typeof ext === 'string' ? JSON.parse(ext) : ext
    for (const v of Object.values(obj || {})) {
      const list = JSON.parse(v?.filter?.text || '[]')
      for (const t of list) {
        const [k, ...rest] = String(t).split('/')
        if (k && rest.length) out[k] = rest.join('/')
      }
    }
  } catch {}
  return out
}

/** 成就目录：[{ id, title, key（规范化标题）, set（成就集）, version }] */
export async function getCatalog (game) {
  return cached(path.join(dir(game), 'catalog.json'), CATALOG_TTL, async () => {
    const data = await getJson(CATALOG_API)
    const out = []
    const walk = nodes => {
      for (const n of nodes || []) {
        for (const it of n.list || []) {
          if (!it?.content_id || !it.title) continue
          const tags = tagsOf(it.ext)
          out.push({ id: String(it.content_id), title: it.title.trim(), key: norm(it.title), set: tags.成就集 || '', version: tags.上线版本 || '' })
        }
        walk(n.children)
      }
    }
    walk(data?.list)
    if (!out.length) throw new Error('观测枢成就目录为空，接口结构可能变了')
    return out
  })
}

/** 特辑名 → 规范化后用来对观测枢的名字：「浮涌的阴影之地·其之一」在观测枢叫「浮涌的阴影之地」 */
const groupKeys = name => {
  const k = norm(name)
  return [k, norm(String(name).replace(/[·・]其之一$/, ''))]
}

/**
 * 在观测枢目录里找成就或特辑对应的条目。
 * 成就按标题对；同名的（比如「画龙点睛」「画龙点睛？」规范化后一样）再看成就集和上线版本挑最像的
 */
export function findEntry (catalog, { title, group = '', version = '', isGroup = false }) {
  const keys = isGroup ? groupKeys(title) : [norm(title)]
  const hits = catalog.filter(e => keys.includes(e.key))
  if (hits.length <= 1) return hits[0] || null
  const score = e => (group && e.set && norm(group).startsWith(norm(e.set)) ? 2 : 0) + (version && e.version === version ? 1 : 0) +
    (e.title === title ? 4 : 0)
  return hits.sort((a, b) => score(b) - score(a))[0]
}

// ---------- 详情 ----------

const decode = s => String(s ?? '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
const plain = html => decode(String(html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()

/** 观测枢图片让 CDN 先缩一下（补充说明里经常是 2000 多像素的截图） */
export const smallImg = (url, w = 720) => /^https?:\/\/(act-upload|uploadstatic|upload-bbs)\.mihoyo\.com\//.test(url || '') && !url.includes('x-oss-process')
  ? `${url}${url.includes('?') ? '&' : '?'}x-oss-process=image/resize,w_${w}/quality,q_85/format,webp`
  : url || ''

/** 富文本里的词条链接（custom-entry-wrapper）→ [{ name, img（原图地址）, amount }] */
function entriesOf (html) {
  const out = []
  for (const m of String(html ?? '').matchAll(/<span[^>]*class="custom-entry-wrapper"[^>]*>/g)) {
    const tag = m[0]
    const attr = k => decode(tag.match(new RegExp(`data-entry-${k}="([^"]*)"`))?.[1] || '')
    const name = attr('name')
    if (name) out.push({ name, img: attr('img'), amount: attr('amount') })
  }
  return out
}

/**
 * 补充说明的富文本 → 安全的 HTML：只留段落、粗体、斜体、颜色和图片，其余标签和属性都去掉
 */
function cleanNote (html) {
  let s = String(html ?? '')
  // 图片：custom-image-view 里的真实地址
  s = s.replace(/<span[^>]*class="custom-image-view"[^>]*data-image-url="([^"]+)"[^>]*>[\s\S]*?<\/span>\s*<\/span>\s*<\/span>/g, (_, url) => `<img src="${smallImg(decode(url))}">`)
  // 词条链接只留名字（加粗）
  s = s.replace(/<span[^>]*class="custom-entry-wrapper"[^>]*data-entry-name="([^"]*)"[^>]*>[\s\S]*?<\/a>\s*<\/span>/g, (_, name) => `<b>${name}</b>`)
  s = s.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (all, close, tag, attrs) => {
    tag = tag.toLowerCase()
    if (tag === 'img') {
      const src = attrs.match(/src="([^"]+)"/)?.[1]
      return src && !close ? `<img src="${smallImg(decode(src))}">` : ''
    }
    if (['p', 'br', 'strong', 'b', 'em', 'i', 'u'].includes(tag)) return `<${close}${tag}>`
    if (tag === 'span') {
      if (close) return '</span>'
      const color = attrs.match(/color:\s*(rgb\([\d,\s]+\)|#[0-9a-fA-F]{3,8})/)?.[1]
      return color ? `<span style="color:${color}">` : '<span>'
    }
    return ''
  })
  return (plain(s) || s.includes('<img')) ? s.replace(/<p>\s*<\/p>/g, '').trim() : ''
}

/** 阶段表：「阶段 / 成就描述 / 达成奖励」→ [{ stage, desc, rewards }] */
function stagesOf (table) {
  return (table?.row || []).map(r => ({ stage: plain(r[0]), desc: plain(r[1]), rewards: entriesOf(r[2]) }))
}

/** 解析一个观测枢成就 / 特辑条目 */
export function parsePage (page) {
  const mods = {}
  for (const m of page?.modules || []) {
    const c = m.components?.[0]
    if (!c) continue
    try {
      mods[m.name] = JSON.parse(c.data)
    } catch {}
  }
  const base = mods.基础信息 || {}
  const attrs = {}
  for (const a of base.attr || []) {
    for (const v of a.value || []) {
      const m = plain(v).match(/^([^：:]{1,8})[：:]\s*([\s\S]*)$/)
      if (m) attrs[m[1]] = { text: m[2].trim(), html: v }
      else if (plain(v)) attrs._tip = plain(v)
    }
  }
  const out = {
    id: String(page.id),
    name: page.name,
    img: base.img || page.icon_url || '',
    icon: page.icon_url || '',
    version: attrs.上线版本?.text || '',
    related: entriesOf(attrs.成就相关?.html).map(r => ({ ...r, img: smallImg(r.img, 96) })),
    note: cleanNote(mods.补充说明?.rich_text),
    strategy: (mods.攻略推荐?.list || []).filter(x => x.link).map(x => ({ title: x.tab_name, cover: smallImg(x.cover, 320), link: x.link }))
  }
  if (mods.成就列表) {
    // 特辑：名片纹饰奖励 + 成就列表
    const reward = entriesOf(base.materials?.value)[0]
    out.kind = 'group'
    out.namecard = reward ? { name: reward.name, img: smallImg(reward.img, 320) } : null
    out.tip = attrs._tip || ''
    out.achievements = (mods.成就列表.tables?.[0]?.row || []).map(r => ({ name: entriesOf(r[0])[0]?.name || plain(r[0]), desc: plain(r[1]) }))
  } else {
    out.kind = 'achievement'
    out.set = entriesOf(base.materials?.value)[0]?.name || ''
    out.stages = stagesOf(mods.详细信息?.tables?.[0])
  }
  return out
}

/** 观测枢条目详情（解析后的结构，缓存 3 天） */
export async function getEntry (game, id) {
  return cached(path.join(dir(game), 'entry', `${id}.json`), ENTRY_TTL, async () => {
    const data = await getJson(ENTRY_API(id))
    if (!data?.page) throw new Error('观测枢词条为空')
    return parsePage(data.page)
  })
}
