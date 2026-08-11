import type { DrawingTypeInfo } from './types'

/** 系统支持的画线类型目录(9 种)+ 操作方法(对齐 web/src/drawing 各工具) */
export const DRAWING_TYPE_CATALOG: DrawingTypeInfo[] = [
  {
    id: 'price-line',
    name: '水平价格线',
    description: '点击图表放置水平价格线(支撑/压力参考)',
    ops: { place: '开启工具后点击图表放置', edit: '拖拽移动 / 输入框精确改价', clear: '选中删除 / 一键清除全部 user 对象' },
    defaultSource: 'user',
  },
  {
    id: 'line',
    name: '线段 / 射线 / 直线',
    description: '按 lineType 区分:segment 线段 / ray 射线 / straight 直线',
    ops: { place: '开启后点击两点(射线/直线可延伸)', edit: '拖拽两端锚点 / 价格编辑', clear: '选中删除 / 一键清除全部 user 对象' },
    defaultSource: 'user',
  },
  {
    id: 'rect',
    name: '矩形',
    description: '点击两点定义对角(支撑/压力区间)',
    ops: { place: '开启后点击两点定义对角', edit: '拖拽锚点 / 价格编辑', clear: '选中删除 / 一键清除全部 user 对象' },
    defaultSource: 'user',
  },
  {
    id: 'measure',
    name: '测量',
    description: '点击两点显示价差 / 涨跌幅 / 根数',
    ops: { place: '开启后点击两点', edit: '拖拽端点重算', clear: '选中删除 / 一键清除全部 user 对象' },
    defaultSource: 'user',
  },
  {
    id: 'fib',
    name: '斐波那契回调',
    description: '点击两点定义回调(0/0.236/0.382/0.5/0.618/0.786/1)',
    ops: { place: '开启后点击两点', edit: '拖拽端点 / 价格编辑', clear: '选中删除 / 一键清除全部 user 对象' },
    defaultSource: 'user',
  },
  {
    id: 'fib-ext',
    name: '斐波那契扩展',
    description: '点击三点定义 A/B/C 预测目标位',
    ops: { place: '开启后点击三点(A/B/C)', edit: '拖拽锚点', clear: '选中删除 / 一键清除全部 user 对象' },
    defaultSource: 'user',
  },
  {
    id: 'vertical-line',
    name: '垂直线',
    description: '点击图表标记关键日期(贯穿竖线,无价格)',
    ops: { place: '开启后点击图表', edit: '左右拖拽移动日期', clear: '选中删除 / 一键清除全部 user 对象' },
    defaultSource: 'user',
  },
  {
    id: 'text',
    name: '文本标注',
    description: '点击图表并输入文本标注',
    ops: { place: '开启后点击图表 + 输入文本', edit: '拖拽锚点 / 重新编辑文本', clear: '选中删除 / 一键清除全部 user 对象' },
    defaultSource: 'user',
  },
  {
    id: 'action-line',
    name: '操作价格线',
    description: '目标价 + 开/加/减/清,股价到达触发后确认执行',
    ops: { place: '开启后点击图表选择操作类型', edit: '拖拽改价重算触发方向', clear: '仅系统可改删(确认交互为画布实现)' },
    defaultSource: 'system',
  },
]
