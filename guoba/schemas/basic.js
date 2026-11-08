export default [
  {
    label: '基础设置',
    component: 'SOFT_GROUP_BEGIN'
  },
  {
    field: 'priority',
    label: '插件优先级',
    helpMessage: '数字越小越先响应',
    bottomHelpMessage: '默认 -110，比观测枢图鉴（-100）靠前，#成就图鉴 这类消息不会被图鉴接走；修改后需重启',
    component: 'InputNumber',
    componentProps: {
      step: 1,
      placeholder: '-110'
    }
  },
  {
    field: 'pageSize',
    label: '每页条数',
    helpMessage: '#成就查漏 / #成就查询 每页显示多少个成就',
    bottomHelpMessage: '默认 30，一页正好一张图；调大的话图片超过切图高度会被拆成多张',
    component: 'InputNumber',
    componentProps: {
      min: 10,
      max: 200,
      step: 5,
      placeholder: '30',
      addonAfter: '个'
    }
  },
  {
    component: 'Divider',
    label: '成就数据'
  },
  {
    field: 'syncHour',
    label: '每日同步时间',
    helpMessage: '每天几点检查 genshin-db 有没有新成就',
    bottomHelpMessage: '0~23，默认 0 点；插件启动后也会先检查一次。修改后需重启',
    component: 'InputNumber',
    componentProps: {
      min: 0,
      max: 23,
      step: 1,
      placeholder: '0',
      addonAfter: '点'
    }
  },
  {
    field: 'mysCompare',
    label: '米游社成就数核对',
    helpMessage: '查漏、统计、录入时顺带和米游社的成就达成数核对',
    bottomHelpMessage: '数量对不上时提醒记录可能过期了；需要原神插件和 #绑定uid，查不到时自动跳过。#成就对比 不受这个开关影响',
    component: 'Switch'
  }
]
