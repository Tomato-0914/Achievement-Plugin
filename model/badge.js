/**
 * 成就徽章图标（内联 SVG）：金色菱形框 + 暗红星云底 + 两侧月桂枝，中间的星星数 = 第几阶段（1~3）。
 * 照游戏里成就列表左边的徽章画的，纯矢量、不用图片文件。没达成的降低饱和度、半透明。
 * 同一页里会出现很多个，按（阶段, 是否达成）缓存 6 种，渐变 id 各不相同，互不干扰
 */

const CX = 50
const CY = 49
const R = 37
const f = n => n.toFixed(2)

function leaf (x, y, rot, L, W) {
  const d = `M0,0 C${f(W)},${f(L * 0.3)} ${f(W * 0.8)},${f(L * 0.75)} 0,${f(L)} C${f(-W * 0.8)},${f(L * 0.75)} ${f(-W)},${f(L * 0.3)} 0,0Z`
  return `<path d="${d}" transform="translate(${f(x)} ${f(y)}) rotate(${rot.toFixed(1)})" fill="url(#leaf-ID)" stroke="#A8792A" stroke-width=".45"/>`
}

/** 一侧月桂枝：side = -1 左，1 右；沿圆弧从底部长到斜上方，每节一对叶子 */
function laurel (side) {
  const [a0, a1] = side < 0 ? [100, 228] : [80, -48]
  const at = deg => [CX + R * Math.cos(deg * Math.PI / 180), CY + R * Math.sin(deg * Math.PI / 180)]
  const pts = Array.from({ length: 27 }, (_, i) => at(a0 + (a1 - a0) * i / 26))
  const out = [`<path d="M${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' L')}" fill="none" stroke="#B98A35" stroke-width="1.1" stroke-linecap="round"/>`]
  const k = 9
  for (let i = 0; i < k; i++) {
    const t = (i + 0.6) / (k + 0.2)
    const a = a0 + (a1 - a0) * t
    const [x, y] = at(a)
    // 叶尖朝枝条生长方向（切线），叶子路径默认朝 +y，所以再减 90°；一片往外偏、一片往里偏
    const grow = a + (side < 0 ? 90 : -90) - 90
    const L = 9.5 - 3.8 * t
    const W = 2.9 - 1.0 * t
    out.push(leaf(x, y, grow + 32 * side, L, W), leaf(x, y, grow - 32 * side, L * 0.92, W * 0.95))
  }
  const [x, y] = at(a1)
  out.push(leaf(x, y, a1 + (side < 0 ? 90 : -90) - 90, 5.5, 1.8))
  return out.join('')
}

function star (x, y, s) {
  const c = s * 0.16
  const d = `M${x},${y - s} C${x + c},${y - c} ${x + c},${y - c} ${x + s},${y} C${x + c},${y + c} ${x + c},${y + c} ${x},${y + s} ` +
    `C${x - c},${y + c} ${x - c},${y + c} ${x - s},${y} C${x - c},${y - c} ${x - c},${y - c} ${x},${y - s}Z`
  return `<path d="${d}" fill="url(#star-ID)" filter="url(#glow-ID)"/>`
}

const STARS = {
  1: [[50, 47, 8.5]],
  2: [[45, 43, 7.2], [56.5, 52, 5.6]],
  3: [[50, 38.5, 6.2], [42.5, 52, 5.4], [57.5, 52, 5.4]]
}

const LAURELS = laurel(-1) + laurel(1)
const cache = new Map()

/** 徽章 SVG 字符串：stars 为 1~3，done 为是否达成 */
export function badgeSvg (stars = 1, done = true) {
  const n = Math.min(3, Math.max(1, Number(stars) || 1))
  const key = `${n}${done ? 'd' : 'u'}`
  if (cache.has(key)) return cache.get(key)
  const body = LAURELS +
    '<path d="M50 84 L54.5 89.5 L50 95 L45.5 89.5Z" fill="url(#gold-ID)" stroke="#A8792A" stroke-width=".6"/>' +
    '<rect x="28.5" y="25.5" width="43" height="43" rx="3" transform="rotate(45 50 47)" fill="url(#gold-ID)" stroke="#9E6F26" stroke-width=".8"/>' +
    '<rect x="32.5" y="29.5" width="35" height="35" rx="1.8" transform="rotate(45 50 47)" fill="url(#neb-ID)" stroke="#FFF3CF" stroke-width="1"/>' +
    '<rect x="34" y="31" width="32" height="32" rx="1.2" transform="rotate(45 50 47)" fill="none" stroke="#2A1A24" stroke-opacity=".35" stroke-width=".6"/>' +
    '<path d="M50 13.5 L53.2 18.5 L50 23 L46.8 18.5Z" fill="url(#gold-ID)" stroke="#9E6F26" stroke-width=".6"/>' +
    STARS[n].map(s => star(...s)).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>` +
    '<linearGradient id="gold-ID" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF2C6"/><stop offset=".45" stop-color="#EBC673"/><stop offset="1" stop-color="#B7832C"/></linearGradient>' +
    '<linearGradient id="leaf-ID" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FCEBB2"/><stop offset="1" stop-color="#D2A04A"/></linearGradient>' +
    '<radialGradient id="neb-ID" cx=".36" cy=".72" r=".9"><stop offset="0" stop-color="#EDAA80"/><stop offset=".26" stop-color="#A2636A"/><stop offset=".6" stop-color="#5B3748"/><stop offset="1" stop-color="#2C1D2B"/></radialGradient>' +
    '<radialGradient id="star-ID" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#FFF7E6"/><stop offset="1" stop-color="#F5DCAE"/></radialGradient>' +
    '<filter id="glow-ID" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
    '<filter id="dim-ID"><feColorMatrix type="saturate" values=".35"/></filter>' +
    `</defs><g${done ? '' : ' filter="url(#dim-ID)" opacity=".62"'}>${body}</g></svg>`
  const out = svg.replace(/-ID/g, `-b${key}`)
  cache.set(key, out)
  return out
}

/** 原石图标（四角星，蓝白渐变） */
export const PRIMO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs>' +
  '<linearGradient id="primo-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#BFE6FF"/><stop offset="1" stop-color="#5D8CE8"/></linearGradient>' +
  '<linearGradient id="primo-e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4D6"/><stop offset="1" stop-color="#E7B866"/></linearGradient></defs>' +
  '<path d="M20 2 C22 14 26 18 38 20 C26 22 22 26 20 38 C18 26 14 22 2 20 C14 18 18 14 20 2Z" fill="url(#primo-g)" stroke="url(#primo-e)" stroke-width="1.4" stroke-linejoin="round"/>' +
  '<path d="M20 9 C21 17 23 19 31 20 C23 21 21 23 20 31 C19 23 17 21 9 20 C17 19 19 17 20 9Z" fill="#FFFFFF" fill-opacity=".55"/></svg>'
