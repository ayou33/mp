# 共享类型(契约事实源)

本文件是 API 的类型唯一事实源(TS 风格),用于生成 OpenAPI schema 与 MCP 工具 JSON Schema。叶子端点文档引用这里的类型,并给出**样例数据**。

## 行情

```ts
type KlinePeriod = 'day' | 'week' | 'month'
type Fq = 'qfq' | 'none'          // 前复权 / 不复权

interface Stock {
  code: string      // 规范化代码,小写 sh/sz/bj + 6 位,如 'sh600519'
  name: string
  market: 'sh' | 'sz' | 'bj'
  kind: 'stock' | 'index' | 'fund' | 'etf'
}

interface KlineBar {
  time: string      // 'YYYY-MM-DD'
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface KlineResponse {
  code: string
  name: string
  period: KlinePeriod
  fq: Fq
  bars: KlineBar[]
  /** 更早历史游标:拉取更早数据时传 before=bars[0].time 之前的日期;到底返回 null */
  nextBefore: string | null
}
```

## 指标

```ts
type IndicatorId =
  | 'ma' | 'ema' | 'bbi' | 'boll' | 'rsi' | 'macd' | 'kdj'
  | 'wr' | 'cci' | 'obv' | 'atr' | 'dmi'
  | (string & {})                    // 用户公式 id

interface IndicatorParam { key: string; value: number | number[] | string }

interface IndicatorCall {
  id?: string                          // 内置指标 id 或用户公式 id
  params?: IndicatorParam[]
  formula?: string                     // 公式 DSL(与 web/src/indicators/custom/formula.ts 同语义)
  formula2?: string                    // band 下轨公式
  shape?: 'line' | 'area' | 'histogram' | 'baseline' | 'band'
}

interface IndicatorPoint { time: string; value: number }
interface OHLCPoint { time: string; open: number; high: number; low: number; close: number }

interface IndicatorOutput {
  key: string
  label: string
  type: 'line' | 'area' | 'histogram' | 'baseline' | 'band' | 'candlestick' | 'bar'
  data: IndicatorPoint[] | OHLCPoint[]   // candlestick/bar 用 OHLCPoint
  lower?: IndicatorPoint[]               // band 下轨
}

interface IndicatorCalcRequest {
  code?: string                          // 二选一:服务端拉 K 线
  bars?: KlineBar[]                      // 或:客户端传入数据
  period?: KlinePeriod
  indicators: IndicatorCall[]
}

interface IndicatorCalcResponse {
  code?: string
  barsCount: number
  outputs: Record<string, IndicatorOutput[]>
}
```

## 自选 / 浏览记录

```ts
interface WatchlistItem { code: string; name: string; addedAt: string }
interface BrowseEntry { code: string; name: string; viewedAt: string }
```

## 用户公式

```ts
interface FormulaOutputSpec {
  shape: 'line' | 'area' | 'histogram' | 'baseline' | 'band'
  lower?: string                         // band 下轨
  baseValue?: number                     // baseline 基准
  label?: string
  scale?: { kind: 'right' } | { kind: 'independent'; id: string }
  visible?: boolean
  color?: string
  width?: number                         // 1-4
  style?: number                         // LineStyle 枚举
}

interface FormulaRecord {
  id: string
  title: string
  shape: 'line' | 'area' | 'histogram' | 'baseline' | 'band'
  formula: string                        // 单表达式 或 多输出脚本(NAME = EXPR / NAME := EXPR)
  formula2?: string
  baseValue?: number
  color?: string
  outputSpecs?: Record<string, FormulaOutputSpec>
  rev: number                            // 保存版本号,更新自增
  createdAt: string
  updatedAt: string
}

interface FormulaTestRequest {
  formula: string
  shape?: FormulaRecord['shape']
  formula2?: string
  baseValue?: number
  outputSpecs?: FormulaRecord['outputSpecs']
  code?: string                          // 缺省用合成样例数据
  bars?: KlineBar[]
}

interface FormulaTestOutput {
  key: string; label: string; shape: string
  valid: number; total: number
  min: number | null; max: number | null; last: number | null
}
interface FormulaTestResult {
  ok: boolean
  compileError?: string
  evalError?: string
  dataSource: string                     // '真实 K 线 N 根' | '合成样例 N 根'
  outputs: FormulaTestOutput[]
  emptyKeys: string[]
}
```

## 配置 / 设置 / 画线

```ts
interface IndicatorConfig {
  custom: Record<string, {
    enabled: boolean
    pane: 'overlay' | 'sub'
    params: Record<string, unknown>
    lineStyles: Record<string, unknown>
    scales?: Record<string, unknown>
    rev?: number
  }>
}

interface UserSettings {
  defaultPeriod: KlinePeriod
  redUp: boolean
  highLowStyle: 'leader' | 'price-line'
}

interface Drawing {
  id: string
  kind: string            // 画线类型(价格线/线段/射线/直线/矩形/测量/斐波那契/垂直线/文本/操作线)
  points: unknown[]       // 各工具私有几何数据(对齐 web/src/drawing/types.ts)
  owner: 'system' | 'user'
  [k: string]: unknown
}
interface DrawingsPayload { stock: string; period: KlinePeriod; items: Drawing[] }
```

## 通用

```ts
interface ApiErrorBody { error: { code: string; message: string; details?: unknown } }
```
