import fs from 'node:fs'
import path from 'node:path'
import { getConfig, dataRoot, ensureDir, pluginName } from '../model/config.js'
import { syncAchievements, formatSync, scheduleAchievementSync } from '../model/data.js'
import { loadRecord, deleteRecord, toUiaf } from '../model/store.js'
import { mysAchievementCount, compareText, BIND_TIP, REBIND_TIP } from '../model/mys.js'
import { GAME, pluginVersion } from '../model/achievement.js'
import { ensureData } from '../model/reply.js'

/** 记录管理：#成就对比、#成就导出、#清空成就记录；主人：#成就更新（同步成就数据） */

// 插件启动后自动同步成就数据，之后每天 syncHour 点检查一次
scheduleAchievementSync(GAME, Math.min(23, Math.max(0, Number(getConfig().syncHour) || 0)))

export class AchievementManage extends plugin {
  constructor () {
    super({
      name: '原神成就-管理',
      dsc: '成就对比、导出、清空记录、同步数据',
      event: 'message',
      priority: getConfig().priority ?? -110,
      rule: [
        { reg: '^#(原神)?成就(对比|核对|校对)$', fnc: 'compare' },
        { reg: '^#(原神)?成就导出$', fnc: 'exportCmd' },
        { reg: '^#(原神)?(清空|删除)(我的)?成就(记录|存档)$', fnc: 'clear' },
        { reg: '^#(原神)?成就(数据)?(强制)?更新$', fnc: 'sync', permission: 'master' }
      ]
    })
  }

  /** #成就对比：和米游社的成就达成数核对；查不到时自己提示（要 #扫码登录 绑定米游社账号，只绑 UID 不够） */
  async compare () {
    const rec = loadRecord(GAME, this.e.user_id)
    const mys = await mysAchievementCount(this.e, { force: true, silent: true })
    if (mys.error) {
      if (mys.needBind === 'expired') return this.reply(`查不到米游社数据，${REBIND_TIP}`)
      if (mys.needBind) return this.reply(`查不到米游社数据，${BIND_TIP}`)
      return this.reply(`查不到米游社数据：${mys.error}`)
    }
    if (!rec) return this.reply(`米游社显示已达成 ${mys.count} 个，你还没有录入成就`)
    return this.reply(compareText(mys.count, rec.done.size).text)
  }

  /** #成就导出：导出成 UIAF v1.1 json 文件发出去 */
  async exportCmd () {
    const data = await ensureData(this)
    if (!data) return true
    const rec = loadRecord(GAME, this.e.user_id)
    if (!rec) return this.reply('你还没有录入成就')
    const dir = ensureDir(path.join(dataRoot, GAME, 'export'))
    const file = path.join(dir, `uiaf_${String(this.e.user_id).replace(/[^\w-]/g, '_')}.json`)
    fs.writeFileSync(file, JSON.stringify(toUiaf(rec, data, pluginVersion())))
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

  async clear () {
    return this.reply(deleteRecord(GAME, this.e.user_id) ? '已删除你的成就记录' : '你还没有成就记录')
  }

  /** #成就更新 / #成就强制更新（主人）：立即从 genshin-db 同步成就数据 */
  async sync () {
    const force = this.e.msg.includes('强制')
    await this.reply(`开始${force ? '重新下载全部' : '同步'}成就数据…`)
    try {
      return this.reply(formatSync(await syncAchievements(GAME, { force })))
    } catch (err) {
      return this.reply(`成就数据同步失败：${err.message}`)
    }
  }
}
