import type { IndicatorPoint, KlineBar } from '../types'

export interface KdjSeriesData {
  k: IndicatorPoint[]
  d: IndicatorPoint[]
  j: IndicatorPoint[]
}

/**
 * KDJ 随机指标(标准 9,3,3):
 * RSV=(C-L)/(H-L)*100(周期内);K=(K*(n-1)+RSV)/n;D=(D*(n-1)+K)/n;J=3K-2D。
 * K/D 初值 50,从第一根起输出。
 */
export function calcKDJ(bars: KlineBar[], period = 9, kSmooth = 3, dSmooth = 3): KdjSeriesData {
  const out: KdjSeriesData = { k: [], d: [], j: [] }
  let k = 50
  let d = 50
  for (let i = 0; i < bars.length; i++) {
    const start = Math.max(0, i - period + 1)
    let high = -Infinity
    let low = Infinity
    for (let j = start; j <= i; j++) {
      if (bars[j].high > high) high = bars[j].high
      if (bars[j].low < low) low = bars[j].low
    }
    const rsv = high === low ? 50 : ((bars[i].close - low) / (high - low)) * 100
    k = (k * (kSmooth - 1) + rsv) / kSmooth
    d = (d * (dSmooth - 1) + k) / dSmooth
    out.k.push({ time: bars[i].time, value: k })
    out.d.push({ time: bars[i].time, value: d })
    out.j.push({ time: bars[i].time, value: 3 * k - 2 * d })
  }
  return out
}
