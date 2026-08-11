import type { IndicatorPoint, KlineBar } from '../types'

/**
 * 顺势指标(CCI):典型价 TP = (H+L+C)/3,CCI = (TP - SMA(TP)) / (0.015 × 平均绝对偏差)。
 * 范围无界,常用 ±100 作超买超卖参考。从第 period 根起输出。
 */
export function calcCCI(bars: KlineBar[], period = 14): IndicatorPoint[] {
  if (period <= 0 || bars.length < period) return []
  const out: IndicatorPoint[] = []
  for (let i = period - 1; i < bars.length; i++) {
    const tpArr: number[] = []
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (bars[j].high + bars[j].low + bars[j].close) / 3
      tpArr.push(tp)
      sum += tp
    }
    const mean = sum / period
    let md = 0
    for (let j = 0; j < period; j++) md += Math.abs(tpArr[j] - mean)
    md /= period
    const cci = md === 0 ? 0 : (tpArr[period - 1] - mean) / (0.015 * md)
    out.push({ time: bars[i].time, value: cci })
  }
  return out
}
