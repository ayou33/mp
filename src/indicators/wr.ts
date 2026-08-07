import type { IndicatorPoint, KlineBar } from '../types'

/**
 * 威廉指标(WR):WR(n) = -100 × (HH(n) - close) / (HH(n) - LL(n))。
 * 范围 [-100, 0];越接近 0 超买,越接近 -100 超卖。从第 period 根起输出。
 */
export function calcWR(bars: KlineBar[], period: number): IndicatorPoint[] {
  if (period <= 0 || bars.length < period) return []
  const out: IndicatorPoint[] = []
  for (let i = period - 1; i < bars.length; i++) {
    let hh = -Infinity
    let ll = Infinity
    for (let j = i - period + 1; j <= i; j++) {
      if (bars[j].high > hh) hh = bars[j].high
      if (bars[j].low < ll) ll = bars[j].low
    }
    const rng = hh - ll
    const wr = rng === 0 ? -50 : (-100 * (hh - bars[i].close)) / rng
    out.push({ time: bars[i].time, value: wr })
  }
  return out
}
