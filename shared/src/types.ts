/**
 * @mp/shared 公共类型:底层行情/序列类型 + api/v1 契约 DTO(与 api/v1/common/types.md 对齐)。
 * 不含任何 DOM / lightweight-charts 运行时依赖(LineStyle 枚举值与其常量一致,本地定义)。
 */

// ===== 底层:行情 / 序列 / 线样式 =====
export type KlinePeriod = 'day' | 'week' | 'month'
export type Fq = 'qfq' | 'none'

export interface KlineBar {
  time: string // 'YYYY-MM-DD'
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface IndicatorPoint {
  time: string
  value: number
}

export interface DailyKline {
  code: string
  name: string
  bars: KlineBar[]
}

/** 线型(与 lightweight-charts LineStyle 枚举值一致,去掉运行时依赖) */
export enum LineStyle {
  Solid = 0,
  Dotted = 1,
  Dashed = 2,
  LargeDashed = 3,
  SparseDotted = 4,
}

export type LineWidth = 1 | 2 | 3 | 4

export interface IndicatorLineStyle {
  color?: string
  width?: LineWidth
  style?: LineStyle
}

// ===== 行情 API =====
export interface Stock {
  code: string
  name: string
  market: 'sh' | 'sz' | 'bj'
  kind: 'stock' | 'index' | 'fund' | 'etf'
}

export interface KlineResponse {
  code: string
  name: string
  period: KlinePeriod
  fq: Fq
  bars: KlineBar[]
  nextBefore: string | null
}

// ===== 指标 API =====
export type IndicatorId =
  | 'ma' | 'ema' | 'bbi' | 'boll' | 'rsi' | 'macd' | 'kdj'
  | 'wr' | 'cci' | 'obv' | 'atr' | 'dmi'
  | (string & {})

export interface IndicatorParam {
  key: string
  value: number | number[] | string
}

export type IndicatorShape = 'line' | 'area' | 'histogram' | 'baseline' | 'band'

export interface IndicatorCall {
  id?: string
  params?: IndicatorParam[]
  formula?: string
  formula2?: string
  shape?: IndicatorShape
}

export interface IndicatorPointData {
  time: string
  value: number
}
export interface OHLCPointData {
  time: string
  open: number
  high: number
  low: number
  close: number
}

export type IndicatorOutputType = 'line' | 'area' | 'histogram' | 'baseline' | 'band' | 'candlestick' | 'bar'

export interface IndicatorOutput {
  key: string
  label: string
  type: IndicatorOutputType
  data: IndicatorPointData[] | OHLCPointData[]
  lower?: IndicatorPointData[]
}

export interface IndicatorCalcRequest {
  code?: string
  bars?: KlineBar[]
  period?: KlinePeriod
  indicators: IndicatorCall[]
}

export interface IndicatorCalcResponse {
  code?: string
  barsCount: number
  outputs: Record<string, IndicatorOutput[]>
}

// ===== 自选 / 浏览记录 =====
export interface WatchlistItem {
  code: string
  name: string
  addedAt: string
}

export interface BrowseEntry {
  code: string
  name: string
  viewedAt: string
}

// ===== 用户公式 =====
export interface FormulaOutputSpec {
  shape: IndicatorShape
  lower?: string
  baseValue?: number
  label?: string
  scale?: { kind: 'right' } | { kind: 'independent'; id: string }
  visible?: boolean
  color?: string
  width?: LineWidth
  style?: LineStyle
}

export interface FormulaRecord {
  id: string
  title: string
  shape: IndicatorShape
  formula: string
  formula2?: string
  baseValue?: number
  color?: string
  outputSpecs?: Record<string, FormulaOutputSpec>
  rev: number
  createdAt: string
  updatedAt: string
}

export interface FormulaTestRequest {
  formula: string
  shape?: IndicatorShape
  formula2?: string
  baseValue?: number
  outputSpecs?: Record<string, FormulaOutputSpec>
  code?: string
  bars?: KlineBar[]
}

export interface FormulaTestOutput {
  key: string
  label: string
  shape: string
  valid: number
  total: number
  min: number | null
  max: number | null
  last: number | null
}

export interface FormulaTestResult {
  ok: boolean
  compileError?: string
  evalError?: string
  dataSource: string
  outputs: FormulaTestOutput[]
  emptyKeys: string[]
}

// ===== 指标配置 / 设置 =====
export interface CustomIndicatorConfigEntry {
  enabled: boolean
  pane: 'overlay' | 'sub'
  params: Record<string, unknown>
  lineStyles: Record<string, unknown>
  scales?: Record<string, unknown>
  rev?: number
}

export interface IndicatorConfig {
  custom: Record<string, CustomIndicatorConfigEntry>
}

export interface UserSettings {
  defaultPeriod: KlinePeriod
  redUp: boolean
  highLowStyle: 'leader' | 'price-line'
}

// ===== 画线 =====
export type DrawingKind =
  | 'line' | 'fib' | 'price-line' | 'action-line' | 'rect' | 'text'
  | 'vertical-line' | 'fib-ext' | 'measure'

export type DrawingSource = 'system' | 'user'

export interface AnchorPoint {
  time: string
  price: number
}

export interface Drawing {
  id: number
  kind: DrawingKind
  source: DrawingSource
  lineType?: 'segment' | 'ray' | 'straight'
  p1?: AnchorPoint
  p2?: AnchorPoint
  p3?: AnchorPoint
  text?: string
  time?: string
  price?: number
  action?: 'open' | 'add' | 'reduce' | 'close'
  status?: 'armed' | 'triggered' | 'executed' | 'violated'
  direction?: 'up' | 'down'
  createdAt?: string
}

export interface DrawingsPayload {
  stock: string
  period: KlinePeriod
  items: Drawing[]
}

export interface DrawingTypeInfo {
  id: DrawingKind
  name: string
  description: string
  ops: { place: string; edit: string; clear: string }
  defaultSource: DrawingSource
}

// ===== 通用 =====
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown }
}
