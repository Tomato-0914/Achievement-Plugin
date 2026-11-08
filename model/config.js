import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

export const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const pluginName = path.basename(pluginRoot)
export const dataRoot = path.join(process.cwd(), 'data', pluginName)

const DEFAULT_FILE = path.join(pluginRoot, 'config', 'default.yaml')
export const USER_FILE = path.join(pluginRoot, 'config', 'config.yaml')

let cached = null
let cachedSig = ''

const log = (level, msg) => (typeof logger !== 'undefined' ? logger[level]?.(`[${pluginName}] ${msg}`) : console.log(`[${pluginName}] ${msg}`))

/** config/config.yaml 开头的说明（替换掉 default.yaml 开头那段） */
const USER_HEADER = [
  '# 你自己的配置：插件首次启动时从 config/default.yaml 复制过来，要改就改这个文件（或者在锅巴里改）。',
  '# 插件更新不会覆盖这个文件；新版本加的配置项会在启动时自动补进来，你改过的值和注释都会保留。',
  ''
].join('\n')

/** 去掉 default.yaml 开头那段「默认配置……不要改这个文件」的说明 */
const stripHeader = def => def.replace(/^(#[^\n]*\n)+\n*/, '')

/** 把 default.yaml 的内容换上用户配置的说明 */
const userCopy = def => `${USER_HEADER}\n${stripHeader(def)}`

/**
 * 首次启动时把 default.yaml（连同注释）复制成 config/config.yaml；
 * 已经有 config.yaml 时，把新版本 default.yaml 里新增的配置项补进去（参考 Cheshire-Plugin 的做法）：
 * 用 YAML 的 Document 读写，用户改过的值和注释都保留，只追加缺的项（嵌套的也会补）。
 * config.yaml 格式写错时不动它，只在日志里提醒
 */
export function initUserConfig () {
  try {
    const def = fs.readFileSync(DEFAULT_FILE, 'utf8')
    const text = fs.existsSync(USER_FILE) ? fs.readFileSync(USER_FILE, 'utf8') : ''
    if (!text.trim()) {
      fs.mkdirSync(path.dirname(USER_FILE), { recursive: true })
      fs.writeFileSync(USER_FILE, userCopy(def))
      log('mark', '已创建配置文件 config/config.yaml，要改配置改这个文件即可')
      return
    }

    const userDoc = YAML.parseDocument(text)
    if (userDoc.errors.length) {
      log('warn', `config/config.yaml 格式有误，先用默认配置：${userDoc.errors[0].message.split('\n')[0]}`)
      return
    }
    // 开头那段说明不能跟着第一个配置项补进去（会写成「不要改这个文件」）
    const defDoc = YAML.parseDocument(stripHeader(def))
    if (!YAML.isMap(defDoc.contents) || !YAML.isMap(userDoc.contents)) return

    const keyOf = pair => (pair?.key && typeof pair.key === 'object' ? pair.key.value : pair?.key)
    const added = []
    const merge = (userMap, defMap, prefix) => {
      for (const pair of defMap.items) {
        const key = keyOf(pair)
        const exist = userMap.items.find(p => keyOf(p) === key)
        if (!exist) {
          // 补进顶层的项前面空一行，和上面的内容分开（嵌套里的不空行）
          if (pair.key && typeof pair.key === 'object') pair.key.spaceBefore = !prefix
          userMap.items.push(pair)
          added.push(prefix + key)
        } else if (YAML.isMap(pair.value) && YAML.isMap(exist.value)) {
          merge(exist.value, pair.value, `${prefix}${key}.`)
        }
      }
    }
    merge(userDoc.contents, defDoc.contents, '')
    if (!added.length) return
    fs.writeFileSync(USER_FILE, userDoc.toString())
    log('mark', `配置文件补上了新的配置项：${added.join('、')}`)
  } catch (err) {
    log('warn', `初始化配置文件失败（先用默认配置）：${err.message}`)
  }
}

/**
 * 修改 config/config.yaml 里的几项并保存，注释和其他内容原样保留（锅巴保存配置时用）。
 * values：{ 'renderScale': 150, 'render.quality': 85 }，点号表示嵌套
 */
export function saveUserConfig (values) {
  const text = fs.existsSync(USER_FILE) ? fs.readFileSync(USER_FILE, 'utf8') : ''
  const doc = YAML.parseDocument(text.trim() ? text : userCopy(fs.readFileSync(DEFAULT_FILE, 'utf8')))
  if (doc.errors.length) throw new Error(`config/config.yaml 格式有误，请先手动修好：${doc.errors[0].message.split('\n')[0]}`)
  if (!YAML.isMap(doc.contents)) doc.contents = doc.createNode({})
  for (const [key, value] of Object.entries(values)) doc.setIn(key.split('.'), value)
  fs.mkdirSync(path.dirname(USER_FILE), { recursive: true })
  fs.writeFileSync(USER_FILE, doc.toString())
}

function mtime (file) {
  try {
    return fs.statSync(file).mtimeMs
  } catch {
    return 0
  }
}

export function readYaml (file) {
  if (!fs.existsSync(file)) return {}
  try {
    return YAML.parse(fs.readFileSync(file, 'utf8')) || {}
  } catch (err) {
    logger.error(`[${pluginName}] YAML 解析失败：${file}`)
    logger.error(err)
    return {}
  }
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v)

function merge (base, over) {
  const out = { ...base }
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v
  }
  return out
}

/** 读取配置（config/default.yaml + config/config.yaml）；文件有改动会自动重新加载 */
export function getConfig () {
  const sig = `${mtime(DEFAULT_FILE)}|${mtime(USER_FILE)}`
  if (cached && sig === cachedSig) return cached
  cached = merge(readYaml(DEFAULT_FILE), readYaml(USER_FILE))
  cachedSig = sig
  return cached
}

initUserConfig()

export function ensureDir (dir) {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** 名称规范化：去掉空白和常见标点、全角转半角、转小写，搜索和匹配用 */
export const norm = s => String(s ?? '')
  .normalize('NFKC')
  .replace(/[\s#·・「」『』《》“”‘’\-—_！!？?，,。.：:]/g, '')
  .toLowerCase()
