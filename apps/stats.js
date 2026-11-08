import { getConfig } from '../model/config.js'
import { loadRecord } from '../model/store.js'
import { GAME, groupProgress } from '../model/achievement.js'
import { ensureData, renderSend } from '../model/reply.js'

/** #成就统计 / #成就：各特辑完成进度，没完成的特辑排前面 */

export class AchievementStats extends plugin {
  constructor () {
    super({
      name: '原神成就-统计',
      dsc: '各特辑完成进度',
      event: 'message',
      priority: getConfig().priority ?? -110,
      rule: [
        { reg: '^#(原神)?(我的)?成就(统计|进度|总览)?$', fnc: 'stats' }
      ]
    })
  }

  async stats () {
    const data = await ensureData(this)
    if (!data) return true
    const rec = loadRecord(GAME, this.e.user_id)
    if (!rec) return this.reply('你还没有录入成就，发送 #成就录入帮助 看怎么导出存档')
    const all = data.groups.map(g => groupProgress(data, g, rec))
    const todo = all.filter(g => g.missing)
    const full = all.filter(g => !g.missing)
    return renderSend(this, 'stats', {
      mode: 'stats',
      title: '成就统计',
      sections: [
        todo.length && { title: `未完成的特辑（${todo.length}）`, groups: todo },
        full.length && { title: `已全部完成（${full.length}）`, groups: full }
      ].filter(Boolean),
      tips: ['发送 <b>#成就查漏</b> 看没完成的成就；只看某个特辑发 <b>#成就查漏 特辑名</b>，太多的话再加版本，如 <b>#成就查漏 天地万象 6.x</b>']
    }, data, rec)
  }
}
