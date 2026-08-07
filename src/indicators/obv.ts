import type { IndicatorPoint, KlineBar } from '../types'

/**
 * 能量潮(OBV):收盘较前收上涨加当日成交量、下跌减、平盘不变,首根取当日量。
 * 累计量能,量价配合判断。自第一根起输出。
 */
export function calcOBV(bars: KlineBar[]): IndicatorPoint[] {
  const out: IndicatorPoint[] = []
  let obv = 0
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) obv = bars[i].volume
    else if (bars[i].close > bars[i - 1].close) obv += bars[i].volume
    else if (bars[i].close < bars[i - 1].close) obv -= bars[i].volume
    out.push({ time: bars[i].time, value: obv })
  }
  return out
}
