/**
 * 指标子系统统一导出:bars 级常用指标纯函数 + 自定义指标框架。
 * 纯计算/公式引擎已迁移到 @mp/shared(单一实现),此处仅做兼容转发。
 */
export {
  calcMA,
  calcEMA,
  BBI_PERIODS,
  calcBBI,
  calcBOLL,
  calcRSI,
  calcMACD,
  type MacdSeriesData,
  type MacdBarPoint,
  calcKDJ,
  type KdjSeriesData,
  calcWR,
  calcCCI,
  calcOBV,
  calcATR,
  calcDMI,
  type DmiResult,
} from '@mp/shared'

// 自定义指标框架(引擎来自 @mp/shared,渲染/持久化仍在 web)
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
  sma,
  ema,
  stddev,
  sum,
  hhv,
  llv,
  wilder,
  ref,
  abs,
  max,
  min,
  crossOver,
  crossUnder,
  hexToRgba,
} from '@mp/shared'