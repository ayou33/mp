import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts'
import type { LineType } from './types'

export type { LineType } from './types'

export interface LinePoint {
  time: Time
  price: number
}

export interface LineDrawing {
  id: number
  type: LineType
  p1: LinePoint
  p2: LinePoint
  /** 只读标记:为 true 时锚点不可拖拽(不可编辑) */
  readonly?: boolean
}

export interface LineDataSource {
  lines: LineDrawing[]
  /** 放置中的锚点(0/1 个) */
  pending: LinePoint[]
  /** 放置第 2 个锚点时跟随鼠标的预览 */
  preview: LinePoint | null
  /** 悬停高亮的画线 id(控制点放大高亮);null/undefined 不高亮 */
  highlight?: number | null
}

export const LINE_COLOR = '#4fc3f7'
export const LINE_TYPES: LineType[] = ['segment', 'ray', 'straight']

/** 按类型计算两点画线的实际端点(pane CSS 坐标);sx 为 null 表示跳过 */
export function lineEndpoints(
  type: LineType,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  h: number,
): { sx: number | null; sy: number; ex: number; ey: number } {
  const extend = (toX: number) => {
    const t = (toX - x1) / (x2 - x1)
    return { x: toX, y: y1 + t * (y2 - y1) }
  }
  if (type === 'segment') return { sx: x1, sy: y1, ex: x2, ey: y2 }
  if (type === 'ray') {
    if (x2 > x1) {
      const e = extend(w)
      return { sx: x1, sy: y1, ex: e.x, ey: e.y }
    }
    if (x2 < x1) {
      const e = extend(0)
      return { sx: x1, sy: y1, ex: e.x, ey: e.y }
    }
    // 垂直射线:向下延伸
    return { sx: x1, sy: y1, ex: x1, ey: y2 > y1 ? h : 0 }
  }
  // straight:两端延伸
  if (x2 === x1) return { sx: x1, sy: 0, ex: x1, ey: h }
  const left = extend(0)
  const right = extend(w)
  return { sx: left.x, sy: left.y, ex: right.x, ey: right.y }
}

/** 两点画线 primitive:线段/射线/直线 + 可拖拽锚点,颜色统一 LINE_COLOR */
export class LinePrimitive implements ISeriesPrimitive<Time> {
  private _data: LineDataSource
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<'Candlestick'> | null = null
  private _view: LinePaneView
  private _renderer: LinePaneRenderer

  requestUpdate: (() => void) | null = null

  constructor(data: LineDataSource) {
    this._data = data
    this._renderer = new LinePaneRenderer(this)
    this._view = new LinePaneView(this._renderer)
  }

  get chart(): IChartApi | null {
    return this._chart
  }

  get series(): ISeriesApi<'Candlestick'> | null {
    return this._series
  }

  get data(): LineDataSource {
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
    return [this._view]
  }
}

class LinePaneView implements IPrimitivePaneView {
  private _renderer: LinePaneRenderer

  constructor(renderer: LinePaneRenderer) {
    this._renderer = renderer
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }
}

class LinePaneRenderer implements IPrimitivePaneRenderer {
  private _primitive: LinePrimitive

  constructor(primitive: LinePrimitive) {
    this._primitive = primitive
  }

  draw(target: CanvasRenderingTarget2D): void {
    const chart = this._primitive.chart
    const series = this._primitive.series
    if (!chart || !series) return
    const items = this._renderItems()
    if (items.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hrp = scope.horizontalPixelRatio
      const vrp = scope.verticalPixelRatio
      const cw = scope.mediaSize.width
      const ch = scope.mediaSize.height
      ctx.strokeStyle = LINE_COLOR
      ctx.fillStyle = LINE_COLOR
      ctx.lineWidth = 1.5 * vrp

      const hl = this._primitive.data.highlight
      for (const item of items) {
        const { sx, sy, ex, ey } = lineEndpoints(item.type, item.x1, item.y1, item.x2, item.y2, cw, ch)
        if (sx === null) continue
        ctx.beginPath()
        ctx.moveTo(sx * hrp, sy * vrp)
        ctx.lineTo(ex * hrp, ey * vrp)
        ctx.stroke()
        const r = 4 * vrp
        ctx.beginPath()
        ctx.arc(item.x1 * hrp, item.y1 * vrp, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(item.x2 * hrp, item.y2 * vrp, r, 0, Math.PI * 2)
        ctx.fill()
        // 悬停高亮:控制点外圈白色圆环
        if (item.id !== undefined && item.id === hl) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2 * vrp
          const hr = 7 * vrp
          ctx.beginPath()
          ctx.arc(item.x1 * hrp, item.y1 * vrp, hr, 0, Math.PI * 2)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(item.x2 * hrp, item.y2 * vrp, hr, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    })
  }

  /** 收集所有可渲染的画线(已完成 + 放置预览);id 用于悬停高亮 */
  private _renderItems(): Array<{ type: LineType; x1: number; y1: number; x2: number; y2: number; id?: number }> {
    const chart = this._primitive.chart!
    const series = this._primitive.series!
    const { lines, pending, preview } = this._primitive.data
    const items: Array<{ type: LineType; x1: number; y1: number; x2: number; y2: number; id?: number }> = []

    for (const l of lines) {
      const x1 = chart.timeScale().timeToCoordinate(l.p1.time)
      const y1 = series.priceToCoordinate(l.p1.price)
      const x2 = chart.timeScale().timeToCoordinate(l.p2.time)
      const y2 = series.priceToCoordinate(l.p2.price)
      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
        items.push({ type: l.type, x1, y1, x2, y2, id: l.id })
      }
    }
    if (pending.length === 1 && preview) {
      const x1 = chart.timeScale().timeToCoordinate(pending[0].time)
      const y1 = series.priceToCoordinate(pending[0].price)
      const x2 = chart.timeScale().timeToCoordinate(preview.time)
      const y2 = series.priceToCoordinate(preview.price)
      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
        items.push({ type: 'segment', x1, y1, x2, y2 })
      }
    }
    return items
  }
}
