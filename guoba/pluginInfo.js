import path from 'node:path'
import { pluginRoot } from '../model/config.js'

export default {
  name: 'Achievement-Plugin',
  title: '原神成就',
  author: '@Tomato-0914',
  authorLink: 'https://github.com/Tomato-0914',
  link: 'https://github.com/Tomato-0914/Achievement-Plugin',
  isV3: true,
  isV2: false,
  description: '原神成就录入、查漏、统计、查询，支持 YaeAchievement、椰羊导出的存档',
  // 插件图标用成就奖杯图（绝对路径）；图标加载不出来时锅巴会退回 icon
  iconPath: path.join(pluginRoot, 'resources', 'img', 'trophy.png'),
  icon: 'mdi:trophy-outline',
  iconColor: '#C9952B'
}
