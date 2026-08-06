import type { KlineBar } from '../types'

/**
 * 真假阴阳着色:颜色按开收(阳红阴绿),空心按较昨收真假(真→空心、假→实心)。
 * 返回可直接 setData 的蜡烛数据。
 */
export function buildCandleData(
  bars: KlineBar[],
  upColor: string,
  downColor: string,
): Array<{ time: string; open: number; high: number; low: number; close: number; color: string; borderColor: string; wickColor: string }> {
  return bars.map((b, i) => {
    const prevClose = i > 0 ? bars[i - 1].close : b.open
    const isUp = b.close >= b.open
    const isReal = b.close >= prevClose
    const bodyColor = isUp ? upColor : downColor
    return {
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      color: isReal ? 'transparent' : bodyColor,
      borderColor: bodyColor,
      wickColor: bodyColor,
    }
  })
}

/** 按全部数据高低点(±6% 边距)适配价格区间,返回 null 表示无数据 */
export function fitPriceRange(bars: KlineBar[]): { from: number; to: number } | null {
  const prices = bars.flatMap((b) => [b.high, b.low])
  if (prices.length === 0) return null
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const pad = (max - min) * 0.06 || 1
  return { from: min - pad, to: max + pad }
}
