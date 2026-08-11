/**
 * 公式 DSL 引擎(服务端共用):解析/求值 + 定义工厂 + 测试引擎。
 * 无 DOM / lightweight-charts 运行时依赖。
 */
export { defineIndicator, defaultParams, resolveParams } from './defineIndicator'
export { createCalcContext } from './calcContext'
export { CUSTOM_INDICATORS } from './registry'
export {
  parseFormula,
  parseFormulaScript,
  parseFormulaExpr,
  evaluateFormula,
  evaluateFormulaScript,
  FormulaError,
  FORMULA_FIELDS,
  FORMULA_FUNCS,
  type InlineLineStyle,
  type FormulaStatement,
} from './formula'
export {
  defineFormulaIndicator,
  FORMULA_SHAPE_LABEL,
  FORMULA_PALETTE,
  type FormulaShape,
  type FormulaIndicatorSpec,
} from './formulaIndicator'
export { runFormulaTest, createSampleBars, type FormulaTestInput } from './formulaTest'
export type {
  CalcContext,
  CustomCandlePoint,
  CustomIndicatorDef,
  CustomOutput,
  CustomOutputMeta,
  CustomParamSpec,
  CustomParamValues,
  CustomPane,
  CustomScale,
  NumberParamSpec,
  ArrayParamSpec,
  SelectParamSpec,
} from './types'
export type { NumArr } from './lib'
export { sma, ema, stddev, sum, hhv, llv, wilder, ref, abs, max, min, refx, barsCount, crossOver, crossUnder, hexToRgba } from './lib'
