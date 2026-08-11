import type { IndicatorPoint, KlineBar } from '../types'

/** BOLL 布林带计算结果:中轨 = SMA(close, period),上/下轨 = 中轨 ± stdDev×σ(总体标准差) */
export interface BollResult {
  mid: IndicatorPoint[]
  upper: IndicatorPoint[]
  lower: IndicatorPoint[]
}

/**
 * 布林带(BOLL):中轨为 N 期简单均线,带宽 = N 期收盘的总体标准差 × 倍数(默认 2)。
 * 输出从第 period 根开始。
 */
export function calcBOLL(bars: KlineBar[], period = 20, stdDev = 2): BollResult {
  const mid: IndicatorPoint[] = []
  const upper: IndicatorPoint[] = []
  const lower: IndicatorPoint[] = []
  if (period <= 0 || bars.length < period) return { mid, upper, lower }

  let sum = 0
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close
    if (i >= period) sum -= bars[i - period].close
    if (i >= period - 1) {
      const mean = sum / period
      let vsum = 0
      for (let j = i - period + 1; j <= i; j++) {
        const d = bars[j].close - mean
        vsum += d * d
      }
      const sd = Math.sqrt(vsum / period)
      const t = bars[i].time
      mid.push({ time: t, value: mean })
      upper.push({ time: t, value: mean + stdDev * sd })
      lower.push({ time: t, value: mean - stdDev * sd })
    }
  }
  return { mid, upper, lower }
}
