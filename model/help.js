/**
 * 帮助内容：帮助图（resources/html/help.html）和纯文字兜底共用一份。
 * 纯文字兜底里每行不以 # 开头：QQ 官方 Bot 会把行首的 # 当成 Markdown 标题，整行变成大字
 */

export const YAE_URL = 'https://github.com/HolographicHat/YaeAchievement/releases/latest'

export const helpSections = [
  {
    key: 'import',
    title: '录入成就',
    sub: '每人一份记录，按游戏内成就 ID 保存',
    items: [
      { cmd: '#成就录入', desc: '单独发送，再发成就文件（json / xlsx / csv）或椰羊分享链接，整份导入并覆盖原有记录' },
      { cmd: '#成就录入 81622', desc: '带上成就 ID 或名称，把这些成就标记为已完成，可以一次写多个（空格分开）' },
      { cmd: '#成就取消录入 ID', desc: '把录错的成就改回未完成；多阶段成就同名，要写 ID' },
      { cmd: '#成就录入帮助', desc: '怎么用 YaeAchievement 导出成就（电脑端，一次导出全部成就）', hot: true }
    ]
  },
  {
    key: 'view',
    title: '查看进度',
    sub: '查漏、统计出图；数量和米游社对不上时会提醒',
    items: [
      { cmd: '#成就查漏', desc: '列出没完成的成就；可加特辑、版本、隐藏、页码：#成就查漏 至冬 / 6.x / 隐藏 / 2' },
      { cmd: '#成就统计', desc: '各特辑完成进度，已获得和还能拿的原石' },
      { cmd: '#成就查询 甘撒', desc: '按名称、描述、ID 或特辑名搜索，录入过的会标出是否完成' }
    ]
  },
  {
    key: 'manage',
    title: '管理记录',
    sub: '',
    items: [
      { cmd: '#成就对比', desc: '和米游社显示的成就达成数核对（需要 #绑定uid）' },
      { cmd: '#成就导出', desc: '导出成 UIAF json，可以导回椰羊、胡桃工具箱' },
      { cmd: '#清空成就记录', desc: '删除自己的成就记录' }
    ]
  },
  {
    key: 'admin',
    title: '主人命令',
    sub: '',
    admin: true,
    items: [
      { cmd: '#成就更新', desc: '立即从 genshin-db 同步成就数据（每天也会自动同步）' },
      { cmd: '#更新成就插件', desc: '从 git 更新插件本身并重启' }
    ]
  }
]

/** #成就录入帮助：YaeAchievement 导出步骤 */
export const importSteps = [
  { title: '下载 YaeAchievement', desc: '在 Windows 电脑上打开 GitHub 发布页，下载 YaeAchievement.exe', link: YAE_URL },
  { title: '运行并进入游戏', desc: '双击运行，它会自动启动原神；点「进入游戏」后原神会自动关闭，成就数据就读好了' },
  { title: '选择导出方式', desc: '工具会问导出到哪里，按下面任选一种' },
  { title: '发给机器人', desc: '发送 #成就录入 椰羊分享链接；或者私聊发 #成就录入 后再发文件。录入后发 #成就查漏 看还差哪些' }
]

export const importWays = [
  { key: '0', name: '椰羊', best: true, desc: '浏览器会打开椰羊网页，复制地址栏的链接（形如 cocogoat.work/achievement?memo=xxxxxxxxx），发送 #成就录入 链接 即可，不用传文件' },
  { key: '4', name: '表格文件', desc: '在 YaeAchievement.exe 同一个文件夹里生成 achievement-时间.csv，把这个文件发给机器人' },
  { key: '8', name: 'UIAF JSON 文件', desc: '生成 uiaf-时间.json，同样把文件发给机器人' }
]

export const importNotes = [
  'YaeAchievement 是第三方开源工具（GPL-3.0），只支持 Windows 电脑，官服、渠道服、国际服都能用',
  '椰羊分享链接有有效期，导出后尽快发；链接打不开时改用表格文件',
  '手机上也可以用椰羊小程序扫描成就后导出 xlsx 表格，再发给机器人',
  '群里的 QQ 官方机器人收不到不带 @ 的文件，发文件请私聊'
]

/** 纯文字兜底（渲染失败时用） */
export function helpText () {
  const lines = ['【原神成就】']
  for (const s of helpSections) {
    lines.push('', `〔${s.title}〕`)
    for (const it of s.items) lines.push(`· ${it.cmd}：${it.desc}`)
  }
  return lines.join('\n')
}

export function importHelpText () {
  const lines = ['【用 YaeAchievement 导出成就】']
  importSteps.forEach((s, i) => lines.push(`${i + 1}. ${s.title}：${s.desc}${s.link ? `\n   ${s.link}` : ''}`))
  lines.push('', '导出方式：')
  for (const w of importWays) lines.push(`· [${w.key}] ${w.name}${w.best ? '（推荐）' : ''}：${w.desc}`)
  lines.push('', ...importNotes.map(n => `※ ${n}`))
  return lines.join('\n')
}
