import { getConfig, saveUserConfig, pluginName } from '../../model/config.js'
import basic from './basic.js'
import image from './image.js'

/* -------------- 表单：每个 SOFT_GROUP_BEGIN 是一个分组页签 -------------- */
export const schemas = [
  ...basic,
  ...image
]

/** 表单里出现的配置项（点号表示嵌套，如 render.quality） */
const FIELDS = schemas.map(s => s.field).filter(Boolean)

/** 保存前校正数值范围，空着的用默认值 */
const clamp = (min, max, def) => v => {
  const n = Number(v)
  return Number.isFinite(n) && v !== '' && v !== null ? Math.min(max, Math.max(min, Math.round(n))) : def
}
const FIX = {
  priority: v => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.round(Number(v)) : -110),
  pageSize: clamp(10, 200, 30),
  syncHour: clamp(0, 23, 0),
  renderScale: clamp(50, 300, 100),
  'render.quality': clamp(1, 100, 90),
  'render.pageHeight': clamp(1000, 10000, 3500)
}

/* -------------- 读取配置：默认配置 + config/config.yaml 合并后的结果 -------------- */
export function getConfigData () {
  return structuredClone(getConfig())
}

/* -------------- 写入配置：只改表单里的项，写进 config/config.yaml，注释和其他内容原样保留 -------------- */
export function setConfigData (data, { Result }) {
  try {
    const values = {}
    for (const field of FIELDS) {
      const value = valueOf(data, field)
      if (value === undefined) continue
      values[field] = FIX[field] ? FIX[field](value) : value
    }
    saveUserConfig(values)
    return Result.ok({}, '保存成功辣~ (*´･ω･)з')
  } catch (err) {
    logger.error(`[${pluginName}] 锅巴保存配置失败`)
    logger.error(err)
    return Result.error({}, `保存失败：${err.message}`)
  }
}

/* ==========================================================
 * 工具函数
 * ========================================================== */

/** 锅巴传回来的数据可能是扁平的（render.quality: 90），也可能是嵌套的（render: { quality: 90 }），两种都认 */
function valueOf (data, field) {
  if (Object.hasOwn(data, field)) return data[field]
  return field.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), data)
}
