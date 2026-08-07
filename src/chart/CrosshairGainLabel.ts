import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import {
  type IChartApi,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesPrimitive,
  type MouseEventParams,
  type SeriesAttachedParameter,
  type Time,
} from 'lightweight-charts'
import type { KlineBar } from '../types'

const UP_COLOR = '#f23645' // 红涨
const DOWN_COLOR = '#089981' // 绿跌
const FONT_SIZE = 11
const LABEL_HEIGHT = FONT_SIZE
const PAD_X = 0
const BOTTOM_MARGIN = 0 // 距主图 pane 底边的留白(px)

interface GainLabelState {
  text: string | null
  color: string
  /** 标签中心水平位置(pane 内 CSS px)= 竖向十字线的 x */
  crossX: number
}

/**
 * 主图底边标签 primitive(自绘):
 * 在主图 pane 底部边线上绘制「距今涨幅」标签,水平中心对齐竖向十字线并跟随其移动。
 * 区别于 timeAxisViews(与十字线日期标签同区域会重叠),paneViews 绘制在 K 线区之上、
 * 紧贴主图底边,不干扰时间轴。
 */
class GainLabelPrimitive implements ISeriesPrimitive<Time> {
  private _state: GainLabelState
  private _view: GainLabelPaneView

  requestUpdate: (() => void) | null = null

  constructor(state: GainLabelState) {
    this._state = state
    this._view = new GainLabelPaneView(this)
  }

  get state(): GainLabelState {
    return this._state
  }

  attached(param: SeriesAttachedParameter<Time, 'Candlestick'>): void {
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.requestUpdate = null
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._view]
  }
}

class GainLabelPaneView implements IPrimitivePaneView {
  private _primitive: GainLabelPrimitive

  constructor(primitive: GainLabelPrimitive) {
    this._primitive = primitive
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return new GainLabelPaneRenderer(this._primitive)
  }
}

class GainLabelPaneRenderer implements IPrimitivePaneRenderer {
  private _primitive: GainLabelPrimitive

  constructor(primitive: GainLabelPrimitive) {
    this._primitive = primitive
  }

  draw(target: CanvasRenderingTarget2D): void {
    const { text, color, crossX } = this._primitive.state
    if (!text) return

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const width = mediaSize.width
      const height = mediaSize.height
      ctx.font = `${FONT_SIZE}px sans-serif`
      const textW = ctx.measureText(text).width
      const labelW = textW + 2 * PAD_X

      // 水平中心对齐十字线,越界时钳制到 pane 内
      let x = Math.round(crossX - labelW / 2)
      x = Math.max(BOTTOM_MARGIN, Math.min(x, width - labelW - BOTTOM_MARGIN))

      // 底部对齐主图 pane 底边(留 BOTTOM_MARGIN 边距)
      const yBottom = height - BOTTOM_MARGIN
      const yTop = yBottom - LABEL_HEIGHT

      // 背景色块(方角,与主图 MA 轴标签同风格)
      ctx.fillStyle = color
      ctx.fillRect(x, yTop, labelW, LABEL_HEIGHT)
      // 文字
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, x + PAD_X, (yTop + yBottom) / 2)
    })
  }
}

/**
 * 距今涨幅标签控制器(非 React):
 * 监听十字光标移动,在主图底部边线显示「距今涨幅:xx%」
 * (十字线所指 K 线收盘价 → 最新收盘价的涨幅),颜色红涨绿跌。
 * 标签中心对齐竖向十字线并跟随其移动;十字线移出 K 线区域或所指 K 线不在数据中时隐藏。
 */
export class CrosshairGainLabel {
  private _series: ISeriesApi<'Candlestick'>
  private _getBars: () => KlineBar[]
  private _primitive: GainLabelPrimitive
  private _state: GainLabelState = { text: null, color: UP_COLOR, crossX: 0 }
  /** 最近一次十字线所指 K 线的时间(基准) */
  private _lastTime: string | null = null
  /** 最近一次十字线 x(pane 内 CSS px) */
  private _crossX = 0
  private _cleanup: () => void

  constructor(chart: IChartApi, series: ISeriesApi<'Candlestick'>, getBars: () => KlineBar[]) {
    this._series = series
    this._getBars = getBars
    this._primitive = new GainLabelPrimitive(this._state)
    series.attachPrimitive(this._primitive)

    const onCrosshair = (param: MouseEventParams<Time>): void => this._onCrosshairMove(param)
    chart.subscribeCrosshairMove(onCrosshair)
    this._cleanup = () => chart.unsubscribeCrosshairMove(onCrosshair)
  }

  dispose(): void {
    this._cleanup()
    this._series.detachPrimitive(this._primitive)
  }

  /** 数据变化(换股/加载更多)后按最近一次十字线位置重算;从未移动十字线则保持隐藏 */
  update(): void {
    if (this._lastTime !== null) this._recalc()
  }

  private _onCrosshairMove(param: MouseEventParams<Time>): void {
    // 无十字线或落在无 K 线的空白区:隐藏
    if (param.time === undefined || param.point === undefined) {
      this._lastTime = null
      this._apply(null)
      return
    }
    this._lastTime = String(param.time)
    this._crossX = param.point.x
    this._recalc()
  }

  private _recalc(): void {
    const bars = this._getBars()
    const last = bars[bars.length - 1]
    const t = this._lastTime
    if (!last || t === null) {
      this._apply(null)
      return
    }
    const idx = bars.findIndex((b) => b.time === t)
    if (idx < 0) {
      // 十字线所指 K 线已不在数据中(如换股) -> 隐藏
      this._apply(null)
      return
    }
    const base = bars[idx].close
    if (base === 0) {
      this._apply(null)
      return
    }
    const pct = ((last.close - base) / base) * 100
    this._apply({
      text: `距今涨幅:${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
      color: pct >= 0 ? UP_COLOR : DOWN_COLOR,
    })
  }

  private _apply(label: { text: string; color: string } | null): void {
    const s = this._state
    const nextText = label?.text ?? null
    const nextColor = label?.color ?? UP_COLOR
    // crossX 变化也要重绘(标签跟随十字线移动)
    if (s.text !== nextText || s.color !== nextColor || s.crossX !== this._crossX) {
      s.text = nextText
      s.color = nextColor
      s.crossX = this._crossX
      this._primitive.requestUpdate?.()
    }
  }
}
