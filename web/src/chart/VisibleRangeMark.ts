import { LineStyle, type IChartApi, type IPriceLine, type ISeriesApi, type LogicalRange } from 'lightweight-charts'
import type { KlineBar } from '../types'
import { barsInWindow } from './candleData'
import { VisibleRangeMarkPrimitive, type VisibleRangeMarkState } from './VisibleRangeMarkPrimitive'

/** 可见高/低点标注的呈现方式:引线(极值点+短引线) / 价格线(半透明横线) */
export type HighLowMarkStyle = 'leader' | 'price-line'

/** 价格线模式样式:库 lineWidth 最小为 1,用半透明(rgba 0.2)进一步减干扰 */
const PRICE_LINE_COLORS = {
  high: 'rgba(242, 54, 69, 0.2)',
  low: 'rgba(8, 153, 129, 0.2)',
}

/**
 * 当前可见区间的最高/最低价标注控制器(非 React):
 * 监听时间轴可见逻辑范围变化,在可见 K 线的最高价/最低价处呈现标注。
 * - leader 模式:VisibleRangeMarkPrimitive 自绘「极值点圆点 + 引线 + 价格标签」
 * - price-line 模式:createPriceLine 半透明横线 + 轴标签(线宽取库最小值 1)
 * 随滚动/缩放/换股/加载更多实时刷新;可见窗口无数据时清空标注。
 * 与用户手动画的价格线互不干扰——本类不参与 hitTest/拖拽/持久化。
 */
export class VisibleRangeMark {
  private _chart: IChartApi
  private _series: ISeriesApi<'Candlestick'>
  private _getBars: () => KlineBar[]
  private _style: HighLowMarkStyle
  /** 引线模式标注数据源(就地变更,遵守 primitive 引用语义) */
  private _state: VisibleRangeMarkState = { high: null, low: null }
  private _primitive: VisibleRangeMarkPrimitive
  private _highLine: IPriceLine | null = null
  private _lowLine: IPriceLine | null = null
  private _cleanup: () => void

  constructor(
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    getBars: () => KlineBar[],
    style: HighLowMarkStyle = 'leader',
  ) {
    this._chart = chart
    this._series = series
    this._getBars = getBars
    this._style = style
    this._primitive = new VisibleRangeMarkPrimitive(this._state)
    series.attachPrimitive(this._primitive)

    // 数据更新后 setVisibleLogicalRange 也会触发本回调,换股/加载更多自动刷新
    const onRange = (range: LogicalRange | null): void => this._update(range)
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)
    this._cleanup = () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange)
    this._update(chart.timeScale().getVisibleLogicalRange())
  }

  dispose(): void {
    this._cleanup()
    this._clearPriceLines()
    this._series.detachPrimitive(this._primitive)
  }

  /** 切换呈现方式(由设置驱动,运行时生效) */
  setStyle(style?: HighLowMarkStyle): void {
    const s = style ?? 'leader'
    if (s === this._style) return
    this._style = s
    this._clearPriceLines()
    this._clearState()
    this._update(this._chart.timeScale().getVisibleLogicalRange())
  }

  private _update(range: LogicalRange | null): void {
    const bars = range ? barsInWindow(this._getBars(), range) : []
    if (bars.length === 0) {
      this._clearPriceLines()
      this._clearState()
      return
    }
    let hiBar = bars[0]
    let loBar = bars[0]
    for (const b of bars) {
      if (b.high > hiBar.high) hiBar = b
      if (b.low < loBar.low) loBar = b
    }
    if (this._style === 'price-line') {
      this._setPriceLine('high', hiBar.high)
      this._setPriceLine('low', loBar.low)
      this._clearState()
    } else {
      this._clearPriceLines()
      const s = this._state
      let changed = false
      if (!s.high || s.high.time !== hiBar.time || s.high.price !== hiBar.high) {
        s.high = { time: hiBar.time, price: hiBar.high }
        changed = true
      }
      if (!s.low || s.low.time !== loBar.time || s.low.price !== loBar.low) {
        s.low = { time: loBar.time, price: loBar.low }
        changed = true
      }
      if (changed) this._primitive.requestUpdate?.()
    }
  }

  private _setPriceLine(kind: 'high' | 'low', price: number): void {
    const existing = kind === 'high' ? this._highLine : this._lowLine
    if (existing) {
      existing.applyOptions({ price })
      return
    }
    const line = this._series.createPriceLine({
      price,
      color: PRICE_LINE_COLORS[kind],
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: kind === 'high' ? '高' : '低',
    })
    if (kind === 'high') this._highLine = line
    else this._lowLine = line
  }

  private _clearPriceLines(): void {
    if (this._highLine) {
      this._series.removePriceLine(this._highLine)
      this._highLine = null
    }
    if (this._lowLine) {
      this._series.removePriceLine(this._lowLine)
      this._lowLine = null
    }
  }

  private _clearState(): void {
    const s = this._state
    if (s.high || s.low) {
      s.high = null
      s.low = null
      this._primitive.requestUpdate?.()
    }
  }
}
