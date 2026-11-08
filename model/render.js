import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfig, pluginRoot, pluginName } from './config.js'

export const TPL = path.join(pluginRoot, 'resources', 'html', 'achievement.html')

let renderer = null
async function getRenderer () {
  // Yunzai 自带的渲染器（TRSS / Miao 都有这个兼容入口），不另起浏览器
  if (!renderer) renderer = (await import('../../../lib/puppeteer/puppeteer.js')).default
  return renderer
}

// 同一时间只渲染一张，小内存机器别让 Chromium 开太多页
let queue = Promise.resolve()
function enqueue (fn) {
  const job = queue.then(fn, fn)
  queue = job.catch(() => {})
  return job
}

/** 渲染器可能返回 Buffer、Buffer 数组、segment 或 base64，统一成 Buffer 数组 */
function toBuffers (ret) {
  const out = []
  for (let x of Array.isArray(ret) ? ret : [ret]) {
    if (!x) continue
    if (typeof x === 'object' && !Buffer.isBuffer(x) && !(x instanceof Uint8Array) && 'file' in x) x = x.file
    if (Buffer.isBuffer(x)) out.push(x)
    else if (x instanceof Uint8Array) out.push(Buffer.from(x))
    else if (typeof x === 'string') {
      if (x.startsWith('base64://')) {
        out.push(Buffer.from(x.slice(9), 'base64'))
      } else {
        let file = x
        if (/^file:/i.test(x)) {
          try { file = fileURLToPath(x) } catch { file = x.replace(/^file:\/\//, '') }
        }
        if (fs.existsSync(file)) out.push(fs.readFileSync(file))
      }
    }
  }
  return out
}

/** 渲染精度：配置 renderScale（50~300）换算成缩放倍数 */
function renderScale () {
  const n = Number(getConfig().renderScale)
  return Math.min(300, Math.max(50, Number.isFinite(n) && n > 0 ? n : 100)) / 100
}

/**
 * 出图（默认用 resources/html/achievement.html），返回图片 Buffer 数组；超过 render.pageHeight 自动切成多张。
 * 调用方自己接住失败情况
 */
export async function renderPage (id, view, tplFile = TPL) {
  const r = getConfig().render || {}
  const scale = renderScale()
  // 注意：别用 path / resPath 这类字段名，Yunzai 渲染器会拿去当保存路径
  const data = {
    tplFile,
    saveId: `achievement_${id}`,
    imgType: 'jpeg',
    quality: r.quality || 90,
    multiPage: true,
    multiPageHeight: Math.round((r.pageHeight || 3500) * scale),
    pageGotoParams: { waitUntil: 'networkidle0', timeout: r.timeout || 60000 },
    width: 800,
    ...view,
    bodyStyle: scale === 1 ? '' : `transform:scale(${scale});transform-origin:0 0`,
    time: new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
  }
  return enqueue(async () => {
    const rd = await getRenderer()
    const started = Date.now()
    let ret
    if (typeof rd.render === 'function') ret = await rd.render(pluginName, data)
    else if (typeof rd.screenshots === 'function') ret = await rd.screenshots(pluginName, data)
    else ret = await rd.screenshot(pluginName, { ...data, multiPage: false })
    const bufs = toBuffers(ret)
    if (!bufs.length) throw new Error('渲染器没有返回图片，看一下后台日志')
    logger.mark(`[${pluginName}] 渲染 ${view.title || id} ${bufs.length} 张，用时 ${Date.now() - started}ms`)
    return bufs
  })
}
