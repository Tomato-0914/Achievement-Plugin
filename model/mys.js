import { pluginName } from './config.js'

/**
 * 米游社战绩首页（game_record/app/genshin/api/index）里的「成就达成数」：stats.achievement_number。
 * 米游社只给这个总数，不给每个成就的完成情况，所以只能用来核对插件里的记录是不是过期了。
 *
 * 不自己管 Cookie：直接用 Yunzai 原神插件（plugins/genshin）的 MysInfo，和 #原神卡片、#角色 走同一套
 * UID 绑定和公共 Cookie。查首页数据只要绑定了 UID 就行，不需要绑定自己的 Cookie。
 * 没装原神插件（比如 TRSS 没装 Yunzai-genshin）时这个功能自动不可用，其余功能不受影响。
 */

let MysInfo
async function loadMysInfo () {
  if (MysInfo !== undefined) return MysInfo
  try {
    MysInfo = (await import('../../genshin/model/mys/mysInfo.js')).default
  } catch (err) {
    logger.debug?.(`[${pluginName}] 没有找到原神插件的 MysInfo，米游社成就数对比不可用：${err.message}`)
    MysInfo = null
  }
  return MysInfo
}

const TTL = 10 * 60 * 1000
const cache = new Map()

const timeout = ms => new Promise((resolve, reject) => setTimeout(() => reject(new Error('米游社查询超时')), ms).unref?.())

/**
 * 查米游社显示的成就达成数，返回 { uid, count }；查不到返回 { error }。
 * silent：不让原神插件回复任何提示（查漏、统计、录入时顺带核对用，查不到就当没有）；
 * 否则「请先#绑定uid」「Cookie 失效」这类提示由原神插件自己回复。
 * 同一个人 10 分钟内的结果直接用缓存，force 时重新查。
 */
export async function mysAchievementCount (e, { silent = false, force = false } = {}) {
  const key = String(e.user_id)
  const hit = cache.get(key)
  if (!force && hit && Date.now() - hit.at < TTL) return hit.data

  const Mys = await loadMysInfo()
  if (!Mys) return { error: '没有安装原神插件（plugins/genshin）' }

  // 包一层事件对象：静默时吞掉所有回复；msg 换成不带数字的，免得把「#成就查漏 2」之类里的数字当成 UID，
  // 原神插件往事件上写的字段（uid、user 等）也落在这一层，不碰原事件
  const ev = Object.create(e)
  ev.msg = '#成就对比'
  if (silent) {
    ev.reply = async () => false
    ev.noTips = true
  }

  let res
  try {
    res = await Promise.race([Mys.get(ev, 'index'), timeout(silent ? 8000 : 20000)])
  } catch (err) {
    if (!silent) logger.warn(`[${pluginName}] 米游社成就数查询失败：${err.message}`)
    return { error: err.message }
  }
  if (!res) return { error: '没有绑定 UID 或没有可用的 Cookie' }
  const count = Number(res?.data?.stats?.achievement_number)
  if (res.retcode !== 0 || !Number.isFinite(count)) return { error: res.message || `retcode=${res.retcode}` }

  const data = { uid: String(ev.uid || ''), count }
  cache.set(key, { at: Date.now(), data })
  return data
}

/** 对比结果，一句话说明：diff = 米游社 - 本地记录 */
export function compareText (mysCount, recCount) {
  const diff = mysCount - recCount
  if (!diff) return { diff, level: 'ok', text: `本地记录与米游社一致（${recCount} 个）` }
  if (diff > 0) return { diff, level: 'warn', text: `米游社 ${mysCount} 个，本地 ${recCount} 个，游戏里多完成了 ${diff} 个，建议重新导出录入` }
  return { diff, level: 'info', text: `本地 ${recCount} 个，比米游社多 ${-diff} 个，可能有录错的，或米游社数据还没刷新` }
}
