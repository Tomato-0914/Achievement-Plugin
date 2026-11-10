import { getConfig, norm, pluginName } from '../model/config.js'
import { loadRecord } from '../model/store.js'
import { GAME, pageSize, findGroups, resolve, search, sortByVersion, groupItems, decorate, textOf } from '../model/achievement.js'
import { ensureData, renderSend } from '../model/reply.js'
import { getCatalog, findEntry, getEntry, smallImg } from '../model/obc.js'

/**
 * #成就详情 名称/ID/特辑名 [页码]：
 * - 成就：各阶段描述和原石、达成情况，加上米游社观测枢的「成就相关」「补充说明」「攻略推荐」
 * - 特辑：特辑图标、名片纹饰奖励、全部成就和达成情况（多的话分页）
 * 观测枢没收录或者请求失败时，用 genshin-db 的数据照常出图，只是少了观测枢那几块
 */

/** 去重后的成就（多阶段的算一个） */
const uniqueKeys = list => [...new Map(list.map(a => [a.key, a])).values()]

export class AchievementDetail extends plugin {
  constructor () {
    super({
      name: '原神成就-详情',
      dsc: '成就详情、特辑详情（米游社观测枢）',
      event: 'message',
      priority: getConfig().priority ?? -110,
      rule: [
        { reg: '^#(原神)?成就(详情|攻略|详细)\\s*(.*)$', fnc: 'detail' }
      ]
    })
  }

  async detail () {
    let q = this.e.msg.replace(/^#(原神)?成就(详情|攻略|详细)/, '').trim()
    let page = 1
    const pm = q.match(/^(.+?)\s+(?:第\s*)?(\d{1,3})\s*页?$/)
    if (pm) {
      q = pm[1].trim()
      page = Math.max(1, Number(pm[2]))
    }
    if (!q) return this.reply('写上成就名、ID 或特辑名，比如：#成就详情 动物园大亨、#成就详情 对决者·第三辑')
    const data = await ensureData(this)
    if (!data) return true
    const rec = loadRecord(GAME, this.e.user_id)

    // 1. ID / 完整成就名
    const exact = resolve(data, q)
    if (exact.length) return this.achievement(data, rec, exact[0].key)
    // 2. 特辑名（完整，或者只对上一个特辑）
    const groups = findGroups(data, q)
    const exactGroup = groups.find(g => norm(g.name) === norm(q))
    if (exactGroup || groups.length === 1) return this.set(data, rec, exactGroup || groups[0], page)
    // 3. 名称、描述里的字
    const found = uniqueKeys(search(data, q))
    if (found.length === 1) return this.achievement(data, rec, found[0].key)
    if (found.length > 1) {
      const names = found.slice(0, 12).map(a => a.title)
      return this.reply(`「${q}」对上了 ${found.length} 个成就，写完整一点：\n${names.join('、')}${found.length > names.length ? ' …' : ''}`)
    }
    if (groups.length > 1) return this.reply(`「${q}」对上了多个特辑：${groups.map(g => g.name).join('、')}`)
    return this.reply(`没找到和「${q}」有关的成就或特辑`)
  }

  /** 观测枢：成就条目和所属特辑条目；请求失败返回 { error } */
  async obc (title, group, version, isGroup = false) {
    try {
      const catalog = await getCatalog(GAME)
      const entry = isGroup ? null : findEntry(catalog, { title, group, version })
      const groupEntry = findEntry(catalog, { title: group, isGroup: true })
      const [detail, groupDetail] = await Promise.all([
        entry ? getEntry(GAME, entry.id) : null,
        groupEntry ? getEntry(GAME, groupEntry.id) : null
      ])
      return { detail, groupDetail }
    } catch (err) {
      logger.warn(`[${pluginName}] 观测枢数据获取失败：${err.message}`)
      return { error: err.message }
    }
  }

  /** 成就详情：一个成就的全部阶段 */
  async achievement (data, rec, key) {
    const list = data.list.filter(a => a.key === key)
    const a = list[0]
    const { detail, groupDetail, error } = await this.obc(a.title, a.group, a.version)
    const primo = list.reduce((n, x) => n + x.primo, 0)
    const done = rec ? list.filter(x => rec.done.has(x.id)).length : 0
    const tips = []
    if (error) tips.push(`米游社观测枢暂时连不上（${error.slice(0, 40)}），下面只有基础数据`)
    else if (!detail) tips.push('米游社观测枢还没收录这个成就，下面是 genshin-db 的数据')
    if (detail?.strategy.length) tips.push(`攻略原文：在米游社观测枢搜索「${a.title}」`)
    if (!rec) tips.push('录入成就后可以看到每个阶段是否达成：<b>#成就录入</b>')

    return renderSend(this, 'detail', {
      mode: 'detail',
      title: `成就详情·${a.title}`,
      sub: '',
      headIcon: smallImg(groupDetail?.img, 160),
      chips: [a.group, a.version && `${a.version} 版本`, a.hidden ? '隐藏成就' : '', a.stages > 1 ? `${a.stages} 个阶段` : '', `共 ${primo} 原石`].filter(Boolean),
      right: rec ? { big: done, total: list.length, label: '已达成' } : null,
      groups: [{ name: a.stages > 1 ? '成就阶段' : '成就', total: list.length, done, items: list.map(x => decorate(x, rec)) }],
      related: detail?.related || [],
      note: detail?.note || '',
      strategy: detail?.strategy || [],
      obcUsed: !!(detail || groupDetail),
      tips,
      fallback: () => list.map(x => textOf(x, rec)).join('\n\n')
    }, data, rec, { mys: false })
  }

  /** 特辑详情：特辑图标、名片纹饰、全部成就（分页） */
  async set (data, rec, group, page) {
    let list = data.list.filter(a => a.groupId === group.id)
    // 没达成的排前面，各自按版本从旧到新
    list = rec ? [...sortByVersion(list.filter(a => !rec.done.has(a.id))), ...sortByVersion(list.filter(a => rec.done.has(a.id)))] : sortByVersion(list)
    const size = pageSize()
    const pages = Math.max(1, Math.ceil(list.length / size))
    if (page > pages) return this.reply(`一共只有 ${pages} 页`)
    const shown = list.slice((page - 1) * size, page * size)
    const { groupDetail, error } = await this.obc(group.name, group.name, '', true)
    const done = rec ? list.filter(a => rec.done.has(a.id)).length : 0
    const tips = []
    if (pages > page) tips.push(`下一页发送 <b>#成就详情 ${group.name} ${page + 1}</b>`)
    if (rec && done < list.length) tips.push(`只看没完成的发 <b>#成就查漏 ${group.name}</b>`)
    if (error) tips.push(`米游社观测枢暂时连不上（${error.slice(0, 40)}），没有特辑图标和名片`)
    if (!rec) tips.push('录入成就后可以看到每个成就是否达成：<b>#成就录入</b>')

    return renderSend(this, 'set', {
      mode: 'set',
      title: `成就特辑·${group.name}`,
      sub: '',
      headIcon: smallImg(groupDetail?.img, 160),
      // 有观测枢的名片卡片时不再重复写奖励
      chips: [`${group.total} 个成就`, `共 ${group.primo} 原石`, !groupDetail?.namecard && group.reward && `奖励「${group.reward}」`].filter(Boolean),
      right: rec ? { big: done, total: list.length, label: '已达成' } : null,
      namecard: groupDetail?.namecard ? { ...groupDetail.namecard, tip: groupDetail.tip } : null,
      obcUsed: !!groupDetail,
      pager: pages > 1 ? { page, pages } : null,
      groups: groupItems(data, shown, rec).map(g => ({ ...g, name: '成就列表', total: list.length, done, items: g.items.map(a => decorate(a, rec)) })),
      tips,
      fallback: () => shown.slice(0, 5).map(a => textOf(a, rec)).join('\n\n')
    }, data, rec, { mys: false })
  }
}
