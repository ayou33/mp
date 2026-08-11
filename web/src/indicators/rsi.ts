import type { IndicatorPoint, KlineBar } from '../types'

/**
 * 相对强弱指标(RSI),Wilder 平滑法,周期默认 14。
 * 输出从第 period 根开始;纯涨 → 100,纯跌 → 0,范围 [0, 100]。
 */
export function calcRSI(bars: KlineBar[], period = 14): IndicatorPoint[] {
  if (period <= 0 || bars.length <= period) return []

  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const change = bars[i].close - bars[i - 1].close
    avgGain += Math.max(change, 0) / period
    avgLoss += Math.max(-change, 0) / period
  }

  const out: IndicatorPoint[] = []
  for (let i = period; i < bars.length; i++) {
    if (i > period) {
      const change = bars[i].close - bars[i - 1].close
      avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period
      avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period
    }
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    out.push({ time: bars[i].time, value: rsi })
  }
  return out
}
