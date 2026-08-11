import type { IndicatorPoint, KlineBar } from '../types'

/** 指数移动平均 EMA */
function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  let ema = 0
  for (let i = 0; i < values.length; i++) {
    ema = i === 0 ? values[i] : values[i] * k + ema * (1 - k)
    out.push(ema)
  }
  return out
}

/** MACD 柱数据点(带正红负绿颜色) */
export type MacdBarPoint = IndicatorPoint & { color: string }

export interface MacdSeriesData {
  dif: IndicatorPoint[]
  dea: IndicatorPoint[]
  macd: MacdBarPoint[]
}

/** 红涨绿跌惯例:柱为正红、负绿;配色参考成交量柱(半透明红/绿,见 KLineChart VOLUME_UP/DOWN) */
const POSITIVE_COLOR = 'rgba(242, 54, 69, 0.35)'
const NEGATIVE_COLOR = 'rgba(8, 153, 129, 0.35)'

/**
 * MACD:EMA(fast)-EMA(slow)=DIF;DEA=EMA(DIF, signal);柱=(DIF-DEA)*2。
 * 从第一根起输出(EMA 从首值起步)。
 */
export function calcMACD(bars: KlineBar[], fast = 12, slow = 26, signal = 9): MacdSeriesData {
  const closes = bars.map((b) => b.close)
  const emaFast = calcEMA(closes, fast)
  const emaSlow = calcEMA(closes, slow)
  const dif = closes.map((_, i) => emaFast[i] - emaSlow[i])
  const dea = calcEMA(dif, signal)

  const out: MacdSeriesData = { dif: [], dea: [], macd: [] }
  bars.forEach((b, i) => {
    out.dif.push({ time: b.time, value: dif[i] })
    out.dea.push({ time: b.time, value: dea[i] })
    const v = (dif[i] - dea[i]) * 2
    out.macd.push({ time: b.time, value: v, color: v >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR })
  })
  return out
}
