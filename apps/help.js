import path from 'node:path'
import { getConfig, pluginRoot } from '../model/config.js'
import { renderPage } from '../model/render.js'
import { getAchievements } from '../model/data.js'
import { helpSections, importSteps, importWays, importNotes, helpText, importHelpText } from '../model/help.js'
import { GAME, img, fmtTime, pluginVersion } from '../model/achievement.js'
import { buttonsOf, sendImages } from '../model/reply.js'

/** #成就帮助、#成就录入帮助：网页排版出图，渲染失败时退回纯文字 */

const HELP_TPL = path.join(pluginRoot, 'resources', 'html', 'help.html')

export class AchievementHelp extends plugin {
  constructor () {
    super({
      name: '原神成就-帮助',
      dsc: '成就帮助、录入帮助',
      event: 'message',
      // 默认 -110，比观测枢图鉴（-100）靠前：#成就图鉴 之类的消息别被图鉴的模糊匹配接走
      priority: getConfig().priority ?? -110,
      rule: [
        { reg: '^#(原神)?成就(帮助|菜单|help|功能|图鉴)$', fnc: 'help' },
        { reg: '^#(原神)?成就(录入|导入)(帮助|教程|说明)$', fnc: 'importHelp' }
      ]
    })
  }

  async help () {
    return this.helpImage('help', helpText)
  }

  async importHelp () {
    return this.helpImage('import', importHelpText)
  }

  /** 纯文字兜底每行不以 # 开头，免得 QQ 官方 Bot 当成 Markdown 标题 */
  async helpImage (mode, fallback) {
    const data = getAchievements(GAME)
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
        version: pluginVersion()
      }, HELP_TPL)
      // 帮助和录入帮助各用各的按钮（录入帮助：录入 帮助）
      return sendImages(this.e, imgs, '成就帮助', buttonsOf(this.e, mode === 'import' ? 'import' : 'help'))
    } catch (err) {
      logger.error(err)
      return this.reply(fallback())
    }
  }
}
