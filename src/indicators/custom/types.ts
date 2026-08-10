import type { LineStyle, LineWidth } from 'lightweight-charts'
import type { IndicatorPoint, KlineBar } from '../../types'
import type { IndicatorLineStyle } from '../SubChartIndicator'
import type { NumArr } from './lib'

/** MACD 包装结果(复用 calcMACD,见 macd.ts) */
export interface MacdWrapResult {
  dif: IndicatorPoint[]
  dea: IndicatorPoint[]
  macd: Array<IndicatorPoint & { color: string }>
}

/** BOLL 包装结果(复用 calcBOLL,见 boll.ts) */
export interface BollWrapResult {
  mid: IndicatorPoint[]
  upper: IndicatorPoint[]
  lower: IndicatorPoint[]
}

/** KDJ 包装结果(复用 calcKDJ,见 kdj.ts) */
export interface KdjWrapResult {
  k: IndicatorPoint[]
  d: IndicatorPoint[]
  j: IndicatorPoint[]
}

/** 挂载位置:主图叠加 or 副图独立 pane */
export type CustomPane = 'overlay' | 'sub'

/** Y 轴分配:right = 与所在 pane 主轴共用;independent = 在同 pane 右侧创建独立轴 */
export type CustomScale =
  | { kind: 'right' }
  | { kind: 'independent'; id: string }

/** 数字参数 */
export interface NumberParamSpec {
  key: string
  label: string
  kind: 'number'
  default: number
  min?: number
  max?: number
  step?: number
}

/** 数组参数(周期列表等) */
export interface ArrayParamSpec {
  key: string
  label: string
  kind: 'array'
  defaults: number[]
}

/** 下拉选择参数 */
export interface SelectParamSpec {
  key: string
  label: string
  kind: 'select'
  options: Array<{ label: string; value: string | number }>
  default: string | number
}

/** 可编辑参数联合 */
export type CustomParamSpec = NumberParamSpec | ArrayParamSpec | SelectParamSpec

/** 已解析的参数值(calc 入参) */
export type CustomParamValues = Record<string, number | number[] | string>

/** 单条 K 线输出点(支持逐点 color,缺省红涨绿跌) */
export interface CustomCandlePoint {
  time: string
  open: number
  high: number
  low: number
  close: number
  color?: string
}

/** 线 */
export interface LineOutput {
  type: 'line'
  key: string
  label: string
  color?: string
  width?: LineWidth
  style?: LineStyle
  scale?: CustomScale
  data: IndicatorPoint[]
}

/** 面积 */
export interface AreaOutput {
  type: 'area'
  key: string
  label: string
  color?: string
  scale?: CustomScale
  data: IndicatorPoint[]
}

/** 柱状(可逐点颜色) */
export interface HistogramOutput {
  type: 'histogram'
  key: string
  label: string
  color?: string
  scale?: CustomScale
  data: Array<IndicatorPoint & { color?: string }>
}

/** 基线(以 baseValue 为界上下分色) */
export interface BaselineOutput {
  type: 'baseline'
  key: string
  label: string
  baseValue?: number
  topColor?: string
  bottomColor?: string
  scale?: CustomScale
  data: IndicatorPoint[]
}

/** K 线(红涨绿跌,可逐点 color) */
export interface CandlestickOutput {
  type: 'candlestick'
  key: string
  label: string
  upColor?: string
  downColor?: string
  scale?: CustomScale
  data: CustomCandlePoint[]
}

/** 条形(红涨绿跌,可逐点 color) */
export interface BarOutput {
  type: 'bar'
  key: string
  label: string
  color?: string
  scale?: CustomScale
  data: CustomCandlePoint[]
}

/** 区间填充(上下轨间半透明,band 双线 + BandPrimitive 填充) */
export interface BandOutput {
  type: 'band'
  key: string
  label: string
  upperColor?: string
  lowerColor?: string
  opacity?: number
  scale?: CustomScale
  upper: IndicatorPoint[]
  lower: IndicatorPoint[]
}

/** 输出判别联合(7 种形态) */
export type CustomOutput =
  | LineOutput
  | AreaOutput
  | HistogramOutput
  | BaselineOutput
  | CandlestickOutput
  | BarOutput
  | BandOutput

/** 输出线共享定义(声明式 outputs 元数据 与 公式脚本每行配置共用的字段语义) */
export interface OutputLineDef {
  key: string
  /** 显示名(图例/角标;缺省 = key 大写) */
  label?: string
  /** 输出类型 */
  type?: CustomOutput['type']
  /** 默认线色(编辑面板未覆盖时) */
  color?: string
  /** 默认线宽(1-4) */
  width?: LineWidth
  /** 默认线型 */
  style?: LineStyle
  /** 默认 Y 轴分配(缺省 right;用户可在编辑面板改) */
  scale?: CustomScale
  /** 是否显示(缺省 true;false = 不渲染/不进图例轴标签,但仍参与计算可被引用) */
  visible?: boolean
}

/** 单条输出线的静态元数据(编辑面板线样式列表,须与 calc 返回的 Output key 对齐) */
export interface CustomOutputMeta extends OutputLineDef {
  key: string
  label: string
  type: CustomOutput['type']
}

/** calc 上下文:bars + 字段序列 + 值函数库 + bars 级常用指标包装 + 对齐工具 */
export interface CalcContext {
  bars: KlineBar[]
  open: NumArr
  high: NumArr
  low: NumArr
  close: NumArr
  volume: NumArr
  // 值级函数(全部返回与输入等长的 (number|null)[])
  sma: (values: NumArr, period: number) => NumArr
  ema: (values: NumArr, period: number) => NumArr
  stddev: (values: NumArr, period: number) => NumArr
  sum: (values: NumArr, period: number) => NumArr
  hhv: (values: NumArr, period: number) => NumArr
  llv: (values: NumArr, period: number) => NumArr
  wilder: (values: NumArr, period: number) => NumArr
  ref: (values: NumArr, n: number) => NumArr
  abs: (values: NumArr) => NumArr
  max: (a: NumArr | number, b: NumArr | number) => NumArr
  min: (a: NumArr | number, b: NumArr | number) => NumArr
  crossOver: (a: NumArr | number, b: NumArr | number) => NumArr
  crossUnder: (a: NumArr | number, b: NumArr | number) => NumArr
  // bars 级常用指标包装(复用现有 calcX,不重写)
  ma: (period: number) => IndicatorPoint[]
  emaBar: (period: number) => IndicatorPoint[]
  macd: (fast?: number, slow?: number, signal?: number) => MacdWrapResult
  rsi: (period?: number) => IndicatorPoint[]
  boll: (period?: number, stdDev?: number) => BollWrapResult
  kdj: (period?: number, kSmooth?: number, dSmooth?: number) => KdjWrapResult
  /** 值序列按索引对齐 bars 时间,过滤 null → IndicatorPoint[] */
  points: (values: NumArr) => IndicatorPoint[]
}

/** 单个自定义指标定义(defineIndicator 工厂产出,编译期校验) */
export interface CustomIndicatorDef {
  /** 全局唯一 id(注册表 key,也作 config.custom[id]) */
  id: string
  title: string
  description?: string
  /** 挂载位置默认值(用户可在配置面板改,实例级选择) */
  defaultPane?: CustomPane
  params?: CustomParamSpec[]
  /** 输出线静态元数据(编辑面板线样式列表;须与 calc 返回的 Output 对齐) */
  outputs: CustomOutputMeta[]
  /** 计算:ctx 注入字段/值函数/常用指标,params 为已解析参数,返回 Output[] */
  calc: (ctx: CalcContext, params: CustomParamValues) => CustomOutput[]
}

/** 单个自定义指标实例配置(持久化在 IndicatorConfig.custom[id]) */
export interface CustomIndicatorConfigEntry {
  enabled: boolean
  pane: CustomPane
  params: CustomParamValues
  /** 各输出线样式覆盖(key = Output.key;未覆盖的线用 def 默认) */
  lineStyles: Record<string, IndicatorLineStyle>
  /** 各输出线 Y 轴分配(key = Output.key;缺省 kind: 'right') */
  scales?: Record<string, CustomScale>
  /**
   * 保存版本号(公式编辑弹窗每次保存自增):公式只改文本、配置其他字段不变时,
   * 保证 manager 的配置签名变化以触发实例重建(def 对象随公式重编译)。
   */
  rev?: number
}
