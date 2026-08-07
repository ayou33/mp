import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts'
import type { DrawingSource } from './types'

/** 垂直线工具:单点(时间)标记关键日期/事件,贯穿主图高度(自绘 VerticalLinePrimitive)。 */

export interface VerticalLineItem {
  id: number
  /** 所在时间(锚点;仅时间维度,无价格) */
  time: Time
  /** 归属(缺省 'user'):system 对象用户不可修改/删除 */
  source?: DrawingSource
}

export interface VerticalLineDataSource {
  items: VerticalLineItem[]
  /** 悬停高亮的 id;null/undefined 不高亮 */
  highlight?: number | null
}

export const VERTICAL_LINE_COLOR = '#d1d4dc'
export const VERTICAL_LINE_HOVER_COLOR = '#ffffff'

/** 基于 lightweight-charts v5 primitives API 的自绘垂直线 */
export class VerticalLinePrimitive implements ISeriesPrimitive<Time> {
  private _data: VerticalLineDataSource
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<'Candlestick', Time> | null = null
  private _paneView: VerticalLinePaneView

  /** 由 attached() 注入的官方重绘触发器 */
  requestUpdate: (() => void) | null = null

  constructor(data: VerticalLineDataSource) {
    this._data = data
    this._paneView = new VerticalLinePaneView(this)
  }

  get chart(): IChartApi | null {
    return this._chart
  }

  get series(): ISeriesApi<'Candlestick', Time> | null {
    return this._series
  }

  get data(): VerticalLineDataSource {
    return this._data
  }

  attached(param: SeriesAttachedParameter<Time, 'Candlestick'>): void {
    this._chart = param.chart
    this._series = param.series
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this._chart = null
    this._series = null
    this.requestUpdate = null
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView]
  }
}

class VerticalLinePaneView implements IPrimitivePaneView {
  private _renderer: VerticalLinePaneRenderer

  constructor(primitive: VerticalLinePrimitive) {
    this._renderer = new VerticalLinePaneRenderer(primitive)
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }
}

class VerticalLinePaneRenderer implements IPrimitivePaneRenderer {
  private _primitive: VerticalLinePrimitive

  constructor(primitive: VerticalLinePrimitive) {
    this._primitive = primitive
  }

  draw(target: CanvasRenderingTarget2D): void {
    const chart = this._primitive.chart
    if (!chart) return
    const items = this._primitive.data.items
    if (items.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hrp = scope.horizontalPixelRatio
      const vrp = scope.verticalPixelRatio
      const h = scope.mediaSize.height
      const bx = (x: number) => x * hrp
      const by = (y: number) => y * vrp
      const hl = this._primitive.data.highlight

      for (const item of items) {
        const x = chart.timeScale().timeToCoordinate(item.time)
        if (x === null) continue
        const highlighted = item.id === hl

        // 贯穿竖线(虚线;悬停时实线提亮)
        ctx.strokeStyle = highlighted ? VERTICAL_LINE_HOVER_COLOR : VERTICAL_LINE_COLOR
        ctx.lineWidth = highlighted ? 2 * vrp : 1.5 * vrp
        ctx.setLineDash([3 * hrp, 3 * hrp])
        ctx.beginPath()
        ctx.moveTo(bx(x), 0)
        ctx.lineTo(bx(x), by(h))
        ctx.stroke()
        ctx.setLineDash([])

        // 顶部小三角标记(标识可命中)
        ctx.fillStyle = highlighted ? VERTICAL_LINE_HOVER_COLOR : VERTICAL_LINE_COLOR
        const s = 5 * vrp
        ctx.beginPath()
        ctx.moveTo(bx(x) - s, by(0))
        ctx.lineTo(bx(x) + s, by(0))
        ctx.lineTo(bx(x), by(2 * s))
        ctx.closePath()
        ctx.fill()
      }
    })
  }
}
