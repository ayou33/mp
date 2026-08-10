import { defineIndicator } from './defineIndicator'
import { CUSTOM_INDICATORS } from './registry'
import type { CustomOutput } from './types'

/**
 * 演示自定义指标:展示框架能力的参考实现(供开发者参考;不参与顶栏/弹窗 UI)。
 * 每个指标直接复用现有 calcX(经 ctx.macd()/ctx.boll() 等),演示 7 种输出形态。
 */

/** MACD(副图):柱 + DIF/DEA 双线,复用 calcMACD */
const cmacd = defineIndicator({
  id: 'cmacd',
  title: '自定义 MACD',
  description: '演示:副图 histogram + line,复用现有 calcMACD',
  defaultPane: 'sub',
  params: [
    { key: 'fast', label: '快线', kind: 'number', default: 12, min: 1, max: 100, step: 1 },
    { key: 'slow', label: '慢线', kind: 'number', default: 26, min: 1, max: 200, step: 1 },
    { key: 'signal', label: '信号线', kind: 'number', default: 9, min: 1, max: 100, step: 1 },
  ],
  outputs: [
    { key: 'macd', label: 'MACD', type: 'histogram', color: '#d1d4dc' },
    { key: 'dif', label: 'DIF', type: 'line', color: '#f0b90b' },
    { key: 'dea', label: 'DEA', type: 'line', color: '#c64dff' },
  ],
  calc: (ctx, params): CustomOutput[] => {
    const r = ctx.macd(params.fast as number, params.slow as number, params.signal as number)
    return [
      { type: 'histogram', key: 'macd', label: 'MACD', data: r.macd },
      { type: 'line', key: 'dif', label: 'DIF', color: '#f0b90b', data: r.dif },
      { type: 'line', key: 'dea', label: 'DEA', color: '#c64dff', data: r.dea },
    ]
  },
})

/** BOLL(主图):区间填充(band) + 中轨,复用 calcBOLL */
const cboll = defineIndicator({
  id: 'cboll',
  title: '自定义 BOLL',
  description: '演示:主图 band 区间填充 + mid 线,复用现有 calcBOLL',
  defaultPane: 'overlay',
  params: [
    { key: 'period', label: '周期', kind: 'number', default: 20, min: 1, max: 200, step: 1 },
    { key: 'stdDev', label: '标准差', kind: 'number', default: 2, min: 0.1, max: 5, step: 0.1 },
  ],
  outputs: [
    { key: 'band', label: 'BOLL', type: 'band', color: '#7890b7' },
    { key: 'mid', label: 'MID', type: 'line', color: '#f0b90b' },
  ],
  calc: (ctx, params): CustomOutput[] => {
    const r = ctx.boll(params.period as number, params.stdDev as number)
    return [
      { type: 'band', key: 'band', label: 'BOLL', upperColor: '#7890b7', lowerColor: '#7890b7', opacity: 0.15, upper: r.upper, lower: r.lower },
      { type: 'line', key: 'mid', label: 'MID', color: '#f0b90b', data: r.mid },
    ]
  },
})

/** K 线(主图):完整 OHLC 输出,演示 candlestick 形态 */
const ckline = defineIndicator({
  id: 'ckline',
  title: '自定义 K 线',
  description: '演示:主图 candlestick 输出(可做 K 线重绘/条件变色)',
  defaultPane: 'overlay',
  outputs: [{ key: 'k', label: 'K', type: 'candlestick', color: '#f23645' }],
  calc: (ctx): CustomOutput[] => {
    return [
      {
        type: 'candlestick',
        key: 'k',
        label: 'K',
        upColor: '#f23645',
        downColor: '#089981',
        data: ctx.bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })),
      },
    ]
  },
})

/** 收盘动量振荡(主图/副图皆可):面积(abs 偏离) + 基线(偏离),演示 area + baseline */
const cmo = defineIndicator({
  id: 'cmo',
  title: '收盘动量',
  description: '演示:area(偏离绝对值) + baseline(偏离,0 轴上下分色)',
  defaultPane: 'sub',
  params: [{ key: 'period', label: '周期', kind: 'number', default: 20, min: 1, max: 200, step: 1 }],
  outputs: [
    { key: 'dev', label: 'DEV', type: 'baseline', color: '#f23645' },
    { key: 'abs', label: 'ABS', type: 'area', color: '#089981' },
  ],
  calc: (ctx, params): CustomOutput[] => {
    const period = params.period as number
    const ma = ctx.sma(ctx.close, period)
    const diff = ma.map((v, i) => (v === null ? null : (ctx.close[i] ?? 0) - v))
    const absDev = ctx.abs(diff)
    return [
      { type: 'area', key: 'abs', label: 'ABS', color: '#089981', data: ctx.points(absDev) },
      { type: 'baseline', key: 'dev', label: 'DEV', baseValue: 0, topColor: '#f23645', bottomColor: '#089981', data: ctx.points(diff) },
    ]
  },
})

// 注册到全局注册表(副图 pane 排列顺序即此处顺序;不参与顶栏 UI)
CUSTOM_INDICATORS.set(cmacd.id, cmacd)
CUSTOM_INDICATORS.set(cboll.id, cboll)
CUSTOM_INDICATORS.set(ckline.id, ckline)
CUSTOM_INDICATORS.set(cmo.id, cmo)
