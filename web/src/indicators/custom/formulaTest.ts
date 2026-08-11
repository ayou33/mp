/**
 * 公式测试引擎(非 React):在弹窗「测试」中校验自定义指标公式能否正常运行。
 * 与保存共用 assembleFormulaSpec 的编译校验,再对真实 K 线(缺省用确定性合成样例)跑 def.calc,
 * 逐输出统计有效点数/min/max/最新值;编译或运行出错即返回错误信息。
 * 用途:提交前保证公式语法正确、可求值、至少一条输出有有效数据。
 */

import type { KlineBar } from '../../types'
import { createCalcContext } from './calcContext'
import { defineFormulaIndicator, type FormulaIndicatorSpec } from './formulaIndicator'
import type { CustomIndicatorDef, CustomOutput } from './types'

/** 单条输出的测试统计 */
export interface FormulaTestOutput {
  key: string
  label: string
  shape: string
  /** 有效数据点数(渲染可见;band = 上下轨覆盖的 K 线数) */
  valid: number
  /** 测试总 K 线数 */
  total: number
  min: number | null
  max: number | null
  /** 最新有效值 */
  last: number | null
}

/** 公式测试结果 */
export interface FormulaTestResult {
  ok: boolean
  /** 编译期错误(语法/变量/形态配置;null = 编译通过) */
  compileError?: string
  /** 运行期错误(calc 求值抛出;null = 求值正常) */
  evalError?: string
  /** 测试数据来源说明 */
  dataSource: string
  outputs: FormulaTestOutput[]
  /** 无有效数据点的输出 key(警告:渲染为空) */
  emptyKeys: string[]
}

/** 测试输入:与公式指标定义一致,可附带真实 K 线 */
export type FormulaTestInput = FormulaIndicatorSpec & { bars?: KlineBar[] }

/**
 * 确定性合成样例 K 线(无真实数据时验证公式可运行):种子随机游走,日期跳过周末贴近真实行情。
 */
export function createSampleBars(count = 200): KlineBar[] {
  let seed = 20260811
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  const bars: KlineBar[] = []
  let price = 100
  const day = new Date(Date.UTC(2026, 0, 5)) // 2026-01-05(周一)
  const round = (v: number): number => Math.round(v * 100) / 100
  const fmt = (d: Date): string => d.toISOString().slice(0, 10)
  for (let i = 0; i < count; i++) {
    const open = price
    const close = Math.max(1, open + (rand() - 0.48) * 4)
    const high = Math.max(open, close) + rand() * 1.5
    const low = Math.min(open, close) - rand() * 1.5
    const volume = Math.round(500000 + rand() * 4000000)
    bars.push({ time: fmt(day), open: round(open), high: round(high), low: round(low), close: round(close), volume })
    price = close
    do {
      day.setUTCDate(day.getUTCDate() + 1)
    } while (day.getUTCDay() === 0 || day.getUTCDay() === 6)
  }
  return bars
}

/** 编译 + 求值 + 统计;任何一步失败返回对应错误(ok = false) */
export function runFormulaTest(input: FormulaTestInput): FormulaTestResult {
  const realBars = input.bars && input.bars.length > 0
  const bars = realBars ? (input.bars as KlineBar[]) : createSampleBars()
  const dataSource = realBars ? `真实 K 线 ${bars.length} 根` : `合成样例 ${bars.length} 根(无真实数据)`

  let def: CustomIndicatorDef
  try {
    def = defineFormulaIndicator(input)
  } catch (e) {
    return { ok: false, compileError: messageOf(e), dataSource, outputs: [], emptyKeys: [] }
  }

  const ctx = createCalcContext(bars)
  let outputs: CustomOutput[]
  try {
    outputs = def.calc(ctx, {})
  } catch (e) {
    return { ok: false, evalError: messageOf(e), dataSource, outputs: [], emptyKeys: [] }
  }

  const stats = outputs.map((o) => outputStats(o, bars.length))
  const emptyKeys = stats.filter((s) => s.valid === 0).map((s) => s.key)
  const allEmpty = stats.length > 0 && stats.every((s) => s.valid === 0)
  return { ok: !allEmpty, dataSource, outputs: stats, emptyKeys }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 按输出形态抽取数值并统计(全部输出均参与统计,含隐藏线) */
function outputStats(o: CustomOutput, total: number): FormulaTestOutput {
  const base = { key: o.key, label: o.label, shape: o.type, total }
  switch (o.type) {
    case 'band': {
      const seen = new Set<string>()
      const vals: number[] = []
      const push = (p: { time: string; value: number }): void => {
        seen.add(p.time)
        if (Number.isFinite(p.value)) vals.push(p.value)
      }
      o.upper.forEach(push)
      o.lower.forEach(push)
      return { ...base, valid: seen.size, min: minOf(vals), max: maxOf(vals), last: lastOf(vals) }
    }
    case 'candlestick':
    case 'bar': {
      const closes = o.data.map((p) => p.close).filter((v) => Number.isFinite(v))
      return {
        ...base,
        valid: o.data.length,
        min: minOf(closes),
        max: maxOf(closes),
        last: o.data.length > 0 ? o.data[o.data.length - 1].close : null,
      }
    }
    default: {
      const vals = o.data.map((p) => p.value).filter((v) => Number.isFinite(v))
      return { ...base, valid: vals.length, min: minOf(vals), max: maxOf(vals), last: lastOf(vals) }
    }
  }
}

function minOf(vals: number[]): number | null {
  if (vals.length === 0) return null
  let m = Infinity
  for (const v of vals) if (v < m) m = v
  return m
}

function maxOf(vals: number[]): number | null {
  if (vals.length === 0) return null
  let m = -Infinity
  for (const v of vals) if (v > m) m = v
  return m
}

function lastOf(vals: number[]): number | null {
  return vals.length > 0 ? vals[vals.length - 1] : null
}
