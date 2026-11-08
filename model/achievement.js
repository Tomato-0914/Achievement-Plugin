import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { getConfig, pluginRoot, norm } from './config.js'

/**
 * 各个功能（apps/ 下的录入、查漏、查询、统计…）共用的成就逻辑：查找、进度统计、版本排序、徽章等。
 * 只放纯函数，不碰消息收发；收发相关的在 model/reply.js
 */

export const GAME = 'gs'

/** resources/img 下的图片 → file:// 地址（给渲染模板用） */
export const img = name => pathToFileURL(path.join(pluginRoot, 'resources', 'img', name)).href

export const fmtTime = ms => ms ? new Date(ms).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) : ''
export const fmtDate = sec => sec ? new Date(sec * 1000).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }) : ''

/** 插件版本号（package.json），帮助图、UIAF 导出用 */
export function pluginVersion () {
  try {
    return JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8')).version || ''
  } catch {
    return ''
  }
}

// 每页条数：默认 30，一页大约 3000 像素高，渲染出来正好一张图（超过 render.pageHeight 会被切成多张）
export const pageSize = () => Math.max(10, Number(getConfig().pageSize) || 30)

/** 查漏、统计、录入时顺带和米游社的成就达成数核对（需要原神插件和绑定的 UID，查不到就不显示） */
export const mysCompare = () => getConfig().mysCompare !== false

/**
 * 成就徽章（透明底 PNG，resources/img/badge-<星数>-<亮几颗>.png）：
 * 单阶段成就 1 颗星，达成白、未达成暗；三阶段成就 3 颗星，第 k 阶段达成时亮 k 颗、没达成亮 k-1 颗。
 * 没录入成就时按达成显示
 */
export function badgeOf (a, done) {
  if (a.stages >= 3) return img(`badge-3-${Math.max(0, Math.min(3, done ? a.stage : a.stage - 1))}.png`)
  return img(`badge-1-${done ? 1 : 0}.png`)
}

/** 成就行要用到的显示字段：是否达成、达成日期、徽章图 */
export function decorate (a, rec) {
  const done = !!rec?.done.has(a.id)
  return { ...a, done, date: done ? fmtDate(rec.done.get(a.id)) : '', badge: badgeOf(a, done || !rec) }
}

/** 成就显示名：多阶段成就带上第几阶段，如「动物园大亨（1/3）」 */
export const label = a => a ? (a.stages > 1 ? `${a.title}（${a.stage}/${a.stages}）` : a.title) : ''

/** 图上显示的用户名 */
export const who = e => {
  const name = e.sender?.card || e.sender?.nickname || ''
  return name || `用户 ${e.user_id}`
}

// ---------- 版本 ----------

/** 版本号比较：'7.2' > '7.10' 这种按数字比，不按字符串比 */
export function cmpVersion (a, b) {
  const [a1 = 0, a2 = 0] = String(a).split('.').map(Number)
  const [b1 = 0, b2 = 0] = String(b).split('.').map(Number)
  return a1 - b1 || a2 - b2
}

/** 成就数据里最新的版本号（genshin-db 收录新版本后自动跟上） */
export function latestVersion (data) {
  return data.list.reduce((best, a) => a.version && cmpVersion(a.version, best) > 0 ? a.version : best, '0.0')
}

/** 「版本新增」「当前版本」「7.2」「7.2版本」「7.2新增」→ 版本号（关键词取最新版本）；不是版本查询返回 '' */
export function versionQuery (q, data) {
  const m = String(q).replace(/\s+/g, '').match(/^(?:(\d+\.\d+)(?:版本)?(?:新增)?(?:成就)?|版本新增|新增成就|最新版本|当前版本(?:新增)?|新版本)$/)
  if (!m) return ''
  return m[1] || latestVersion(data)
}

/** 按版本号从旧到新排，同版本保持原来的顺序（多阶段成就挨在一起） */
export function sortByVersion (list) {
  return list.map((a, i) => [a, i]).sort((x, y) => cmpVersion(x[0].version || '0', y[0].version || '0') || x[1] - y[1]).map(([a]) => a)
}

/** 按大版本统计条数（新版本在前），列表太长时提示「按版本缩小范围」用 */
export function versionBreakdown (list) {
  const count = new Map()
  for (const a of list) {
    const v = a.version ? `${a.version.split('.')[0]}.x` : ''
    if (v) count.set(v, (count.get(v) || 0) + 1)
  }
  return [...count].sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
}

/** 「#成就查漏 天地万象 1.x（98）· 2.x（120）…」这样的一行提示 */
export function versionTip (cmd, list) {
  const vs = versionBreakdown(list)
  if (vs.length < 2) return ''
  return `太多了翻不完，可以按版本看：${vs.map(([v, n]) => `<b>${v}</b>（${n}）`).join(' · ')}，比如 <b>${cmd} ${vs[0][0]}</b>`
}

// ---------- 进度统计 ----------

/** 完成度：没全部完成时不四舍五入到 100% */
export function percent (done, total) {
  if (!total) return '0'
  const p = Math.floor(done / total * 1000) / 10
  return String(done < total ? Math.min(p, 99.9) : 100)
}

/** 总进度：已完成、未完成、原石；recorded 是记录里的全部 ID 数（含成就数据里还没有的新成就），和米游社比较用 */
export function summarize (data, rec) {
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
  return { done, total, missing: total - done, pct: percent(done, total), primoDone, primoMissing: primoAll - primoDone, recorded: rec?.done.size || 0 }
}

/** 一个特辑的进度 */
export function groupProgress (data, g, rec) {
  let done = 0
  let primoMissing = 0
  for (const a of data.list) {
    if (a.groupId !== g.id) continue
    if (rec?.done.has(a.id)) done++
    else primoMissing += a.primo
  }
  return { name: g.name, id: g.id, total: g.total, done, missing: g.total - done, primoMissing, pct: percent(done, g.total) }
}

/** 按特辑分组：分组卡片按成就在列表里第一次出现的顺序排（列表已经排好序了），组内保持列表顺序 */
export function groupItems (data, items, rec) {
  const pick = new Map()
  for (const a of items) {
    if (!pick.has(a.groupId)) pick.set(a.groupId, [])
    pick.get(a.groupId).push(a)
  }
  const byId = new Map(data.groups.map(g => [g.id, g]))
  return [...pick].filter(([id]) => byId.has(id)).map(([id, list]) => ({ ...groupProgress(data, byId.get(id), rec), items: list }))
}

// ---------- 查找 ----------

/** 特辑关键词 → 特辑列表：完全一致优先，其次包含（比如「至冬」匹配到两个至冬特辑） */
export function findGroups (data, q) {
  const k = norm(q)
  if (!k) return []
  const exact = data.groups.filter(g => norm(g.name) === k)
  return exact.length ? exact : data.groups.filter(g => norm(g.name).includes(k))
}

/** 名称或 ID → 成就列表 */
export function resolve (data, q) {
  q = String(q).trim()
  if (/^\d{5,6}$/.test(q)) return data.byId.has(Number(q)) ? [data.byId.get(Number(q))] : []
  const k = norm(q)
  return k ? data.list.filter(a => norm(a.title) === k) : []
}

/** 关键词搜索：ID → 名称完全一致 → 名称包含 → 描述包含 */
export function search (data, q) {
  const exact = resolve(data, q)
  if (exact.length) return exact
  const k = norm(q)
  if (!k) return []
  const byTitle = data.list.filter(a => norm(a.title).includes(k))
  return byTitle.length ? byTitle : data.list.filter(a => norm(a.desc).includes(k))
}

/** 出图失败时一个成就的纯文字兜底 */
export function textOf (a, rec) {
  const tags = [a.group, a.stages > 1 ? `第 ${a.stage}/${a.stages} 阶段` : '', a.hidden ? '隐藏成就' : '', a.version ? `${a.version} 版本` : ''].filter(Boolean)
  const lines = [`【${a.title}】#${a.id}`, tags.join(' · '), a.desc, `奖励：原石 ×${a.primo}`]
  if (rec) lines.push(`状态：${rec.done.has(a.id) ? '✅ 已完成' : '❌ 未完成'}`)
  return lines.join('\n')
}
