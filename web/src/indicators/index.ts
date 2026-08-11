/**
 * 指标子系统统一导出:bars 级常用指标纯函数(自定义指标可经此引用)+ 自定义指标框架。
 * 约定:所有 calcX 均为纯函数,输入 bars + 参数,输出 IndicatorPoint[] 或 {dif,dea,macd} 等复合结构。
 */
export { calcMA } from './ma'
export { calcEMA } from './ema'
export { BBI_PERIODS, calcBBI } from './bbi'
export { calcBOLL } from './boll'
export { calcRSI } from './rsi'
export { calcMACD, type MacdSeriesData, type MacdBarPoint } from './macd'
export { calcKDJ, type KdjSeriesData } from './kdj'
export { calcWR } from './wr'
export { calcCCI } from './cci'
export { calcOBV } from './obv'
export { calcATR } from './atr'
export { calcDMI, type DmiResult } from './dmi'

// 自定义指标框架
export {
  defineIndicator,
  CUSTOM_INDICATORS,
  type CustomIndicatorDef,
  type CustomIndicatorConfigEntry,
  type CustomOutput,
  type CustomParamValues,
  type CalcContext,
  type CustomPane,
  type CustomScale,
  type CustomParamSpec,
  type CustomOutputMeta,
  type CustomCandlePoint,
} from './custom'
export { sma, ema, stddev, sum, hhv, llv, wilder, ref, abs, max, min, crossOver, crossUnder, hexToRgba } from './custom/lib'
