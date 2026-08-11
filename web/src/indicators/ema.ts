import type { IndicatorPoint, KlineBar } from '../types'

/**
 * 指数移动平均(EMA)。
 * 平滑系数 k = 2/(period+1);初值取第一根收盘,自第一根起输出。
 */
export function calcEMA(bars: KlineBar[], period: number): IndicatorPoint[] {
  if (period <= 0 || bars.length === 0) return []
  const k = 2 / (period + 1)
  const out: IndicatorPoint[] = []
  let ema = bars[0].close
  for (let i = 0; i < bars.length; i++) {
    ema = i === 0 ? bars[0].close : bars[i].close * k + ema * (1 - k)
    out.push({ time: bars[i].time, value: ema })
  }
  return out
}
