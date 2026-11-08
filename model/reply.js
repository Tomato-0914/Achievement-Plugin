import { getConfig, pluginName } from './config.js'
import { renderPage } from './render.js'
import { getAchievements, syncAchievements, syncing } from './data.js'
import { mysAchievementCount, compareText } from './mys.js'
import { GAME, img, fmtTime, mysCompare, summarize, who } from './achievement.js'

/**
 * 各个功能共用的回复逻辑：按钮、发图、出图、成就数据检查。
 * 需要回复消息的函数第一个参数传插件实例（this），用它的 e 和 reply
 */

// ---------- 按钮 ----------

/**
 * 按钮：只有 QQ 官方 Bot（QQBot 适配器）支持，其他适配器（icqq、OneBot 等）不发，免得报错；配置 buttons: false 可以关掉。
 * 录入、查询是输入按钮（填进输入框，用户补完再发），其余是回调按钮（点了直接执行）
 */
const BTN = {
  录入: { text: '录入', input: '#成就录入' },
  查询: { text: '查询', input: '#成就查询' },
  查漏: { text: '查漏', callback: '#成就查漏' },
  统计: { text: '统计', callback: '#成就统计' },
  导出: { text: '导出', callback: '#成就导出' },
  帮助: { text: '帮助', callback: '#成就帮助' },
  录入帮助: { text: '录入帮助', callback: '#成就录入帮助' }
}
const BUTTONS = {
  help: [['录入', '查询', '查漏'], ['统计', '导出'], ['录入帮助']],
  import: [['录入', '帮助']],
  missing: [['查漏', '统计', '导出'], ['帮助']],
  query: [['查询', '查漏', '统计'], ['帮助']],
  stats: [['查询', '查漏', '统计'], ['帮助']]
}

/** kind：help / import / missing / query / stats；不支持按钮时返回 null */
export function buttonsOf (e, kind) {
  if (getConfig().buttons === false || !BUTTONS[kind]) return null
  if (e?.bot?.adapter?.id !== 'QQBot' || typeof segment === 'undefined' || typeof segment.button !== 'function') return null
  return segment.button(...BUTTONS[kind].map(row => row.map(k => BTN[k])))
}

// ---------- 发图 ----------

/** 发图：一张直接发（带按钮的话一起发）；多张合并转发，按钮另发一条 */
export async function sendImages (e, imgs, title, buttons = null) {
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

// ---------- 成就数据 ----------

/** 成就数据；还没同步过时顺手开始同步并提示，返回 null */
export async function ensureData (p) {
  const data = getAchievements(GAME)
  if (data) return data
  if (!syncing(GAME)) syncAchievements(GAME).catch(err => logger.warn(`[${pluginName}] 成就数据同步失败：${err.message}`))
  await p.reply('成就数据还没同步完成（首次需要一两分钟从 genshin-db 下载），请稍后再试')
  return null
}

// ---------- 查漏 / 查询 / 统计出图 ----------

/** 查漏、统计图上的米游社核对结果；关掉了、没记录或查不到时返回 null */
async function mysView (e, rec) {
  if (!rec || !mysCompare()) return null
  const mys = await mysAchievementCount(e, { silent: true })
  return mys.error ? null : { ...mys, ...compareText(mys.count, rec.done.size) }
}

/**
 * 查漏 / 查询 / 统计出图并发送（共用 resources/html/achievement.html），带对应的按钮。
 * view.mode 是 missing / query / stats；view.fallback 是出图失败时的文字兜底；mys 为 false 时不核对米游社
 */
export async function renderSend (p, id, view, data, rec, { mys: withMys = true } = {}) {
  const { fallback, ...rest } = view
  // 出图要一两秒（还可能先查米游社），先回一句；配置 renderTip: false 关掉
  if (getConfig().renderTip !== false) await p.reply('查询中，请稍等...')
  try {
    // 先核对米游社（10 分钟内有缓存；静默查询最多等 8 秒，查不到就不显示），再出图
    const mys = withMys ? await mysView(p.e, rec) : null
    const summary = summarize(data, rec)
    const imgs = await renderPage(id, {
      sub: who(p.e).replace(/[<>&"]/g, ''),
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
    return sendImages(p.e, imgs, view.title, buttonsOf(p.e, view.mode))
  } catch (err) {
    logger.error(err)
    return p.reply(fallback ? fallback() : `${view.title}图片生成失败：${err.message}`)
  }
}
