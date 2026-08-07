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

/** 矩形工具:两对角锚点框选支撑/压力区间(自绘 RectPrimitive)。 */

export interface RectPoint {
  time: Time
  price: number
}

export interface RectDrawing {
  id: number
  p1: RectPoint
  p2: RectPoint
  /** 归属(缺省 'user'):system 对象用户不可修改/删除 */
  source?: DrawingSource
}

export interface RectDataSource {
  /** 已完成的矩形 */
  rects: RectDrawing[]
  /** 放置中的锚点(0/1 个) */
  pending: RectPoint[]
  /** 放置第 2 个锚点时跟随鼠标的预览 */
  preview: RectPoint | null
  /** 悬停高亮的矩形 id(控制点放大高亮);null/undefined 不高亮 */
  highlight?: number | null
}

export const RECT_COLOR = '#00bcd4'

/** 单个待渲染的矩形(两个对角锚点;id 用于悬停高亮) */
export interface RenderRect {
  id: number
  p1: RectPoint
  p2: RectPoint
}

/** 基于 lightweight-charts v5 primitives API 的自绘矩形 */
export class RectPrimitive implements ISeriesPrimitive<Time> {
  private _data: RectDataSource
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<'Candlestick', Time> | null = null
  private _paneView: RectPaneView

  /** 由 attached() 注入的官方重绘触发器 */
  requestUpdate: (() => void) | null = null

  constructor(data: RectDataSource) {
    this._data = data
    this._paneView = new RectPaneView(this)
  }

  get chart(): IChartApi | null {
    return this._chart
  }

  get series(): ISeriesApi<'Candlestick', Time> | null {
    return this._series
  }

  get data(): RectDataSource {
    return this._data
  }

  /** 当前需要渲染的所有矩形(已完成 + 绘制中的) */
  renderRects(): RenderRect[] {
    const { rects, pending, preview } = this._data
    const out: RenderRect[] = rects.map((r) => ({ id: r.id, p1: r.p1, p2: r.p2 }))
    if (pending.length === 2) {
      out.push({ id: -1, p1: pending[0], p2: pending[1] })
    } else if (pending.length === 1 && preview) {
      out.push({ id: -1, p1: pending[0], p2: preview })
    }
    return out
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

class RectPaneView implements IPrimitivePaneView {
  private _renderer: RectPaneRenderer

  constructor(primitive: RectPrimitive) {
    this._renderer = new RectPaneRenderer(primitive)
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }
}

class RectPaneRenderer implements IPrimitivePaneRenderer {
  private _primitive: RectPrimitive

  constructor(primitive: RectPrimitive) {
    this._primitive = primitive
  }

  draw(target: CanvasRenderingTarget2D): void {
    const chart = this._primitive.chart
    const series = this._primitive.series
    if (!chart || !series) return
    const rects = this._primitive.renderRects()
    if (rects.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hrp = scope.horizontalPixelRatio
      const vrp = scope.verticalPixelRatio
      const bx = (x: number) => x * hrp
      const by = (y: number) => y * vrp
      const hl = this._primitive.data.highlight

      for (const rc of rects) {
        const x1 = chart.timeScale().timeToCoordinate(rc.p1.time)
        const y1 = series.priceToCoordinate(rc.p1.price)
        const x2 = chart.timeScale().timeToCoordinate(rc.p2.time)
        const y2 = series.priceToCoordinate(rc.p2.price)
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue

        const rx = Math.min(bx(x1), bx(x2))
        const ry = Math.min(by(y1), by(y2))
        const rw = Math.abs(bx(x2) - bx(x1))
        const rh = Math.abs(by(y2) - by(y1))

        // 半透明填充 + 描边
        ctx.globalAlpha = 0.12
        ctx.fillStyle = RECT_COLOR
        ctx.fillRect(rx, ry, rw, rh)
        ctx.globalAlpha = 1
        ctx.strokeStyle = RECT_COLOR
        ctx.lineWidth = 1.5 * vrp
        ctx.strokeRect(rx, ry, rw, rh)

        // 对角锚点圆点
        ctx.fillStyle = RECT_COLOR
        const r = 4 * vrp
        ctx.beginPath()
        ctx.arc(bx(x1), by(y1), r, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(bx(x2), by(y2), r, 0, Math.PI * 2)
        ctx.fill()

        // 悬停高亮:控制点外圈白色圆环
        if (rc.id === hl) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2 * vrp
          const hr = 7 * vrp
          ctx.beginPath()
          ctx.arc(bx(x1), by(y1), hr, 0, Math.PI * 2)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(bx(x2), by(y2), hr, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    })
  }
}
