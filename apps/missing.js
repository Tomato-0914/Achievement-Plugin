import { getConfig } from '../model/config.js'
import { loadRecord } from '../model/store.js'
import { GAME, pageSize, findGroups, groupItems, decorate, versionTip } from '../model/achievement.js'
import { ensureData, renderSend } from '../model/reply.js'

/** #成就查漏 [特辑] [版本] [隐藏] [页码]：没完成的成就按游戏成就列表的样子出图 */

export class AchievementMissing extends plugin {
  constructor () {
    super({
      name: '原神成就-查漏',
      dsc: '列出没完成的成就',
      event: 'message',
      priority: getConfig().priority ?? -110,
      rule: [
        { reg: '^#(原神)?成就(查漏|缺失|未完成)(.*)$', fnc: 'missing' }
      ]
    })
  }

  async missing () {
    const data = await ensureData(this)
    if (!data) return true
    const rec = loadRecord(GAME, this.e.user_id)
    if (!rec) return this.reply('你还没有录入成就，发送 #成就录入 导入椰羊等工具导出的存档')

    // 解析参数：末尾页码、版本（6.0 / 6.x）、「隐藏」，剩下的是特辑名
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

    return renderSend(this, 'missing', {
      mode: 'missing',
      title: '成就查漏',
      filter: filterParts.join('；'),
      pager: pages > 1 ? { page, pages, count: pool.length } : null,
      groups: groupItems(data, items, rec).map(g => ({ ...g, items: g.items.map(a => decorate(a, rec)) })),
      empty: conds.length ? '这个范围内的成就都完成啦' : '全部成就都完成啦！',
      tips
    }, data, rec)
  }
}
