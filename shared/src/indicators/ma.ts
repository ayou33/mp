import type { IndicatorPoint, KlineBar } from '../types'

/**
 * 简单移动平均线(MA)。
 * 输出从第 period 根开始(前 period-1 根不足窗口,跳过)。
 */
export function calcMA(bars: KlineBar[], period: number): IndicatorPoint[] {
  if (period <= 0 || bars.length < period) return []
  const out: IndicatorPoint[] = []
  let sum = 0
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close
    if (i >= period) sum -= bars[i - period].close
    if (i >= period - 1) {
      out.push({ time: bars[i].time, value: sum / period })
    }
  }
  return out
}
