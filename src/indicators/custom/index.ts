/**
 * 自定义指标框架公共导出(非 React,见 CLAUDE.md)。
 * 引用方式:
 *   import { defineIndicator, CUSTOM_INDICATORS, type CalcContext, type CustomOutput } from '../../indicators/custom'
 *   import { sma, ema, crossOver } from '../../indicators/custom/lib'
 */
export { defineIndicator, defaultParams, resolveParams } from './defineIndicator'
export { createCalcContext } from './calcContext'
export { CUSTOM_INDICATORS } from './registry'
export { CustomIndicatorManager } from './CustomIndicatorManager'
export { CustomIndicatorInstance } from './CustomIndicatorInstance'
export { BandPrimitive, type BandState } from './BandPrimitive'
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
  type FormulaOutputSpec,
} from './formulaIndicator'
export {
  USER_FORMULA_RECORDS,
  loadUserFormulas,
  saveUserFormulas,
  registerUserFormula,
  unregisterUserFormula,
  newUserFormulaId,
  type UserFormulaRecord,
} from './userFormulas'
import './demos'
export type {
  MacdWrapResult,
  BollWrapResult,
  KdjWrapResult,
  CustomPane,
  CustomScale,
  NumberParamSpec,
  ArrayParamSpec,
  SelectParamSpec,
  CustomParamSpec,
  CustomParamValues,
  CustomCandlePoint,
  LineOutput,
  AreaOutput,
  HistogramOutput,
  BaselineOutput,
  CandlestickOutput,
  BarOutput,
  BandOutput,
  CustomOutput,
  CustomOutputMeta,
  CalcContext,
  CustomIndicatorDef,
  CustomIndicatorConfigEntry,
} from './types'
export type { NumArr } from './lib'
export {
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
  refx,
  barsCount,
  crossOver,
  crossUnder,
  hexToRgba,
} from './lib'
