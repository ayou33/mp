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

/** 可见窗口(逻辑索引,含端点)内的 bars;未传 window 返回全部,越界/空返回 [] */
export function barsInWindow(bars: KlineBar[], window?: { from: number; to: number }): KlineBar[] {
  if (!window) return bars
  const lo = Math.max(0, Math.floor(window.from))
  const hi = Math.min(bars.length - 1, Math.ceil(window.to))
  if (lo > hi || lo >= bars.length) return []
  return bars.slice(lo, hi + 1)
}

/**
 * 按高低点(±6% 边距)适配价格区间,返回 null 表示无数据。
 * 传 window(当前可见逻辑范围)时只统计窗口内的 K 线,保证价格轴分辨率
 * 针对当前可见区(而非全部加载数据),可见 K 线才能占满 scaleMargins 定义的渲染区域。
 */
export function fitPriceRange(
  bars: KlineBar[],
  window?: { from: number; to: number },
): { from: number; to: number } | null {
  const prices = barsInWindow(bars, window).flatMap((b) => [b.high, b.low])
  if (prices.length === 0) return null
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const pad = (max - min) * 0.06 || 1
  return { from: min - pad, to: max + pad }
}
