import type { IndicatorPoint, KlineBar } from '../../types'
import { calcBOLL } from '../boll'
import { calcEMA } from '../ema'
import { calcKDJ } from '../kdj'
import { calcMA } from '../ma'
import { calcMACD } from '../macd'
import { calcRSI } from '../rsi'
import {
  abs,
  crossOver,
  crossUnder,
  ema,
  hhv,
  llv,
  max,
  min,
  ref,
  refx,
  barsCount,
  sma,
  stddev,
  sum,
  wilder,
  type NumArr,
} from './lib'
import type { CalcContext, KdjWrapResult, MacdWrapResult, BollWrapResult } from './types'

/**
 * 构造 calc 上下文:注入 bars 与字段序列(close/open/high/low/volume)、
 * 值级函数库、bars 级常用指标包装(复用现有 calcX,不重写)、points() 对齐工具。
 * 每次数据更新重建一次(成本低:纯函数 + 一次映射)。
 */
export function createCalcContext(bars: KlineBar[]): CalcContext {
  const close = bars.map((b) => b.close)
  const open = bars.map((b) => b.open)
  const high = bars.map((b) => b.high)
  const low = bars.map((b) => b.low)
  const volume = bars.map((b) => b.volume)

  /** 值序列按索引对齐 bars 时间、过滤 null → IndicatorPoint[] */
  const points = (values: NumArr): IndicatorPoint[] => {
    const out: IndicatorPoint[] = []
    const n = Math.min(values.length, bars.length)
    for (let i = 0; i < n; i++) {
      const v = values[i]
      if (v === null || !Number.isFinite(v)) continue
      out.push({ time: bars[i].time, value: v })
    }
    return out
  }

  return {
    bars,
    open,
    high,
    low,
    close,
    volume,
    // 值级函数库
    sma,
    ema,
    stddev,
    sum,
    hhv,
    llv,
    wilder,
    ref,
    refx,
    barsCount,
    abs,
    max,
    min,
    crossOver,
    crossUnder,
    // bars 级常用指标包装(复用现有 calcX)
    ma: (period) => calcMA(bars, period),
    emaBar: (period) => calcEMA(bars, period),
    macd: (fast, slow, signal) => {
      const r = calcMACD(bars, fast, slow, signal)
      return r as MacdWrapResult
    },
    rsi: (period) => calcRSI(bars, period),
    boll: (period, stdDev) => {
      const r = calcBOLL(bars, period, stdDev)
      return r as BollWrapResult
    },
    kdj: (period, kSmooth, dSmooth) => {
      const r = calcKDJ(bars, period, kSmooth, dSmooth)
      return r as KdjWrapResult
    },
    points,
  }
}
