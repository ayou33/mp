import type { IndicatorPoint, KlineBar } from '../types'
import { calcMA } from './ma'

export const BBI_PERIODS = [3, 6, 12, 24]

/**
 * BBI 多空指标:BBI = (MA(p1) + MA(p2) + MA(p3) + MA(p4)) / 周期数。
 * 从最大周期的首根起输出。
 */
export function calcBBI(bars: KlineBar[], periods: number[] = BBI_PERIODS): IndicatorPoint[] {
  if (periods.length === 0) return []
  const start = Math.max(...periods)
  if (bars.length < start) return []
  const mas = periods.map((p) => calcMA(bars, p))
  const out: IndicatorPoint[] = []
  for (let i = start - 1; i < bars.length; i++) {
    let sum = 0
    for (let k = 0; k < periods.length; k++) {
      sum += mas[k][i - periods[k] + 1].value
    }
    out.push({ time: bars[i].time, value: sum / periods.length })
  }
  return out
}
