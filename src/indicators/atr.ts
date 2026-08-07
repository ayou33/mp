import type { IndicatorPoint, KlineBar } from '../types'

/**
 * 平均真实波幅(ATR):TR = max(H-L, |H-前收|, |L-前收|),ATR 用 Wilder 平滑。
 * 波动率/止损位参考。输出从第 period 根起。
 */
export function calcATR(bars: KlineBar[], period = 14): IndicatorPoint[] {
  if (period <= 0 || bars.length <= period) return []
  const tr = (i: number): number =>
    Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    )

  let atr = 0
  for (let i = 1; i <= period; i++) atr += tr(i)
  atr /= period
  const out: IndicatorPoint[] = [{ time: bars[period].time, value: atr }]
  for (let i = period + 1; i < bars.length; i++) {
    atr = (atr * (period - 1) + tr(i)) / period
    out.push({ time: bars[i].time, value: atr })
  }
  return out
}
