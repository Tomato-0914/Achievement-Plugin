import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { getConfig, readYaml, USER_FILE } from './model/config.js'

/** 锅巴表单项：field 用点号表示嵌套配置 */
const schemas = [
  { component: 'Divider', label: '基础设置' },
  { field: 'priority', label: '插件优先级', component: 'InputNumber', bottomHelpMessage: '数字越小越先响应，默认 -110（比观测枢图鉴的 -100 靠前）；修改后需重启', componentProps: { placeholder: '-110' } },
  { field: 'pageSize', label: '每页条数', component: 'InputNumber', bottomHelpMessage: '#成就查漏 / #成就查询 每页显示多少个成就，默认 30（一页正好一张图）', componentProps: { min: 10, max: 200, placeholder: '30' } },
  { field: 'renderTip', label: '生成提示', component: 'Switch', bottomHelpMessage: '查漏、查询、统计出图前先回复「查询中，请稍等...」' },
  { field: 'buttons', label: '按钮', component: 'Switch', bottomHelpMessage: '帮助、查漏、查询、统计的图片下面带按钮（只有 QQ 官方 Bot 支持，其他适配器自动不加）' },
  { field: 'mysCompare', label: '米游社成就数核对', component: 'Switch', bottomHelpMessage: '查漏、统计、录入时顺带和米游社的成就达成数核对，对不上时提醒记录可能过期了；需要原神插件和 #绑定uid，查不到时自动跳过' },
  { field: 'syncHour', label: '每日同步时间（点）', component: 'InputNumber', bottomHelpMessage: '每天几点检查 genshin-db 有没有新成就，0~23；修改后需重启', componentProps: { min: 0, max: 23, placeholder: '0' } },

  { component: 'Divider', label: '图片' },
  { field: 'renderScale', label: '渲染精度', component: 'InputNumber', bottomHelpMessage: '50~300，默认 100；数值越大图片越清晰，体积也越大', componentProps: { min: 50, max: 300, placeholder: '100' } },
  { field: 'render.quality', label: '图片质量', component: 'InputNumber', bottomHelpMessage: 'JPEG 质量 1~100', componentProps: { min: 1, max: 100, placeholder: '90' } }
]

const fields = schemas.map(s => s.field).filter(Boolean)
const getPath = (obj, key) => key.split('.').reduce((o, k) => o?.[k], obj)
const isObj = v => v && typeof v === 'object' && !Array.isArray(v)
const flatten = (obj, pre = '') => Object.entries(obj || {}).flatMap(([k, v]) => {
  const key = pre ? `${pre}.${k}` : k
  return isObj(v) && !fields.includes(key) ? flatten(v, key) : [[key, v]]
})
function setPath (obj, key, value) {
  const keys = key.split('.')
  let o = obj
  for (const k of keys.slice(0, -1)) o = o[k] && typeof o[k] === 'object' ? o[k] : (o[k] = {})
  o[keys[keys.length - 1]] = value
}

/** 锅巴插件配置入口：读取合并后的配置，保存时写入 config/config.yaml */
export function supportGuoba () {
  return {
    pluginInfo: {
      name: 'Achievement-Plugin',
      title: '原神成就',
      author: '@Tomato-0914',
      authorLink: 'https://github.com/Tomato-0914',
      link: 'https://github.com/Tomato-0914/Achievement-Plugin',
      isV3: true,
      isV2: false,
      description: '原神成就录入、查漏、统计、查询，支持椰羊表格和 UIAF',
      icon: 'mdi:trophy-outline',
      iconColor: '#C9952B'
    },
    configInfo: {
      schemas,
      getConfigData () {
        const cfg = getConfig()
        return { ...cfg, ...Object.fromEntries(fields.map(f => [f, getPath(cfg, f)])) }
      },
      setConfigData (data, { Result }) {
        const user = readYaml(USER_FILE)
        const fix = {
          renderScale: v => Math.min(300, Math.max(50, Number(v) || 100)),
          syncHour: v => Math.min(23, Math.max(0, Number(v) || 0))
        }
        for (const [key, value] of flatten(data)) {
          if (!fields.includes(key)) continue
          setPath(user, key, fix[key] ? fix[key](value) : value)
        }
        fs.mkdirSync(path.dirname(USER_FILE), { recursive: true })
        fs.writeFileSync(USER_FILE, YAML.stringify(user))
        return Result.ok({}, '保存成功~')
      }
    }
  }
}
