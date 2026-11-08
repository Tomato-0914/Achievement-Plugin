export default [
  {
    label: '图片设置',
    component: 'SOFT_GROUP_BEGIN'
  },
  {
    field: 'renderScale',
    label: '渲染精度',
    helpMessage: '帮助、查漏、查询、统计图片的清晰度',
    bottomHelpMessage: '50~300，默认 100；数值越大图片越清晰，体积也越大，出图也更慢。保存后立即生效',
    component: 'InputNumber',
    required: true,
    componentProps: {
      min: 50,
      max: 300,
      step: 10,
      placeholder: '100',
      addonAfter: '%'
    }
  },
  {
    field: 'render.quality',
    label: '图片质量',
    helpMessage: 'JPEG 压缩质量',
    bottomHelpMessage: '1~100，默认 90；越低图片越小，但会有压缩痕迹',
    component: 'InputNumber',
    componentProps: {
      min: 1,
      max: 100,
      step: 5,
      placeholder: '90'
    }
  },
  {
    field: 'render.pageHeight',
    label: '切图高度',
    helpMessage: '图片超过这个高度会被切成多张，合并转发发出',
    bottomHelpMessage: '默认 3500；一般不用改，配合每页条数使用',
    component: 'InputNumber',
    componentProps: {
      min: 1000,
      max: 10000,
      step: 500,
      placeholder: '3500',
      addonAfter: 'px'
    }
  },
  {
    component: 'Divider',
    label: '回复'
  },
  {
    field: 'renderTip',
    label: '生成提示',
    helpMessage: '出图前先回一句提示',
    bottomHelpMessage: '查漏、查询、统计出图前先回复「查询中，请稍等...」',
    component: 'Switch'
  },
  {
    field: 'buttons',
    label: '按钮',
    helpMessage: '图片下面带快捷按钮',
    bottomHelpMessage: '帮助、查漏、查询、统计的图片下面带按钮；只有 QQ 官方 Bot 支持，其他适配器自动不发',
    component: 'Switch'
  }
]
