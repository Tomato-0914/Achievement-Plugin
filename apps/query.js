import { getConfig, norm } from '../model/config.js'
import { getAchievements } from '../model/data.js'
import { loadRecord } from '../model/store.js'
import { GAME, pageSize, findGroups, resolve, search, versionQuery, sortByVersion, groupItems, decorate, textOf } from '../model/achievement.js'
import { ensureData, renderSend } from '../model/reply.js'

/**
 * #成就查询 关键词 [页码]：按 ID、名称、特辑、描述搜索，也支持「版本新增」和「7.1」这样的版本查询。
 * 不带「查询」的 #成就xxx 只认 ID、完整的成就名或特辑名，对不上就放行
 */

export class AchievementQuery extends plugin {
  constructor () {
    super({
      name: '原神成就-查询',
      dsc: '成就查询、版本新增',
      event: 'message',
      // 「#成就xxx」是兜底规则，比其他成就指令低一级，免得抢了查漏、统计这些指令；仍然比观测枢图鉴（-100）靠前
      priority: (getConfig().priority ?? -110) + 1,
      rule: [
        { reg: '^#(原神)?成就(查询|搜索|查找)?\\s*(.+)$', fnc: 'query' }
      ]
    })
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
    const data = explicit ? await ensureData(this) : getAchievements(GAME)
    if (!data) return explicit

    const rec = loadRecord(GAME, this.e.user_id)
    // 查找顺序：版本查询 → ID / 完整成就名 → 特辑名（完整或部分，如「至冬」）→ 成就名包含 → 描述包含；不带「查询」时只认完整写法
    const groups = findGroups(data, q)
    const exactGroup = groups.length === 1 && norm(groups[0].name) === norm(q)
    const ver = versionQuery(q, data)
    let list = ver ? data.list.filter(a => a.version === ver) : resolve(data, q)
    if (ver && !list.length) return this.reply(`没有 ${ver} 版本新增的成就数据`)
    let byGroup = false
    if (!list.length && (exactGroup || (explicit && groups.length))) {
      list = data.list.filter(a => groups.some(g => g.id === a.groupId))
      byGroup = true
    }
    if (!list.length && explicit) list = search(data, q)
    if (!list.length) return explicit ? this.reply(`没找到和「${q}」有关的成就`) : false

    // 排序（在分页之前排）：录入过成就的，没达成的排最前面；再按版本号从旧到新
    list = rec ? [...sortByVersion(list.filter(a => !rec.done.has(a.id))), ...sortByVersion(list.filter(a => rec.done.has(a.id)))] : sortByVersion(list)

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

    return renderSend(this, 'query', {
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
      fallback: () => shown.slice(0, 5).map(a => textOf(a, rec)).join('\n\n')
    }, data, rec, { mys: false })
  }
}
