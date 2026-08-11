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

/**
 * 斐波那契扩展工具(自绘 FibExtPrimitive):三点 A/B/C,
 * 扩展价位 = C + (B - A) × ratio,画水平虚线目标位 + A→B→C 连线。
 */

export interface FibExtPoint {
  time: Time
  price: number
}

export interface FibExtDrawing {
  id: number
  /** A 点(段起点) */
  p1: FibExtPoint
  /** B 点(段终点) */
  p2: FibExtPoint
  /** C 点(回调点,扩展的起点) */
  p3: FibExtPoint
  /** 归属(缺省 'user'):system 对象用户不可修改/删除 */
  source?: DrawingSource
}

export interface FibExtDataSource {
  /** 已完成的斐波那契扩展 */
  fibs: FibExtDrawing[]
  /** 放置中的锚点(0 / 1 / 2 个) */
  pending: FibExtPoint[]
  /** 放置第 2/3 个锚点时跟随鼠标的预览位置 */
  preview: FibExtPoint | null
  /** 悬停高亮的 id(控制点放大高亮);null/undefined 不高亮 */
  highlight?: number | null
}

export const FIB_EXT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 4.236] as const
export const FIB_EXT_COLOR = '#b685f0'

/** 0.618 -> "61.8%", 1 -> "100%", 2.618 -> "261.8%" */
const pct = (r: number) => `${(r * 100).toFixed(1).replace(/\.0$/, '')}%`

/** 单个待渲染的斐波那契扩展(三个锚点;id 用于悬停高亮) */
export interface RenderFibExt {
  id: number
  p1: FibExtPoint
  p2: FibExtPoint
  p3: FibExtPoint
}

/** 基于 lightweight-charts v5 primitives API 的自绘斐波那契扩展 */
export class FibExtPrimitive implements ISeriesPrimitive<Time> {
  private _data: FibExtDataSource
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<'Candlestick', Time> | null = null
  private _paneView: FibExtPaneView

  /** 由 attached() 注入的官方重绘触发器 */
  requestUpdate: (() => void) | null = null

  constructor(data: FibExtDataSource) {
    this._data = data
    this._paneView = new FibExtPaneView(this)
  }

  get chart(): IChartApi | null {
    return this._chart
  }

  get series(): ISeriesApi<'Candlestick', Time> | null {
    return this._series
  }

  get data(): FibExtDataSource {
    return this._data
  }

  /** 当前需要渲染的所有扩展(已完成 + 绘制中的) */
  renderFibs(): RenderFibExt[] {
    const { fibs, pending, preview } = this._data
    const out: RenderFibExt[] = fibs.map((f) => ({ id: f.id, p1: f.p1, p2: f.p2, p3: f.p3 }))
    if (pending.length === 1 && preview) {
      out.push({ id: -1, p1: pending[0], p2: preview, p3: preview })
    } else if (pending.length === 2 && preview) {
      out.push({ id: -1, p1: pending[0], p2: pending[1], p3: preview })
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

class FibExtPaneView implements IPrimitivePaneView {
  private _renderer: FibExtPaneRenderer

  constructor(primitive: FibExtPrimitive) {
    this._renderer = new FibExtPaneRenderer(primitive)
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }
}

class FibExtPaneRenderer implements IPrimitivePaneRenderer {
  private _primitive: FibExtPrimitive

  constructor(primitive: FibExtPrimitive) {
    this._primitive = primitive
  }

  draw(target: CanvasRenderingTarget2D): void {
    const chart = this._primitive.chart
    const series = this._primitive.series
    if (!chart || !series) return
    const fibs = this._primitive.renderFibs()
    if (fibs.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hrp = scope.horizontalPixelRatio
      const vrp = scope.verticalPixelRatio
      const w = scope.mediaSize.width
      const bx = (x: number) => x * hrp
      const by = (y: number) => y * vrp
      const hl = this._primitive.data.highlight

      ctx.save()
      ctx.fillStyle = FIB_EXT_COLOR
      ctx.strokeStyle = FIB_EXT_COLOR
      ctx.lineWidth = 1.5 * vrp

      for (const f of fibs) {
        const x1 = chart.timeScale().timeToCoordinate(f.p1.time)
        const y1 = series.priceToCoordinate(f.p1.price)
        const x2 = chart.timeScale().timeToCoordinate(f.p2.time)
        const y2 = series.priceToCoordinate(f.p2.price)
        const x3 = chart.timeScale().timeToCoordinate(f.p3.time)
        const y3 = series.priceToCoordinate(f.p3.price)
        if (x1 === null || x2 === null || x3 === null || y1 === null || y2 === null || y3 === null) continue

        // A→B→C 连线 + 锚点圆点
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.moveTo(bx(x1), by(y1))
        ctx.lineTo(bx(x2), by(y2))
        ctx.lineTo(bx(x3), by(y3))
        ctx.stroke()
        const r = 4 * vrp
        for (const [ax, ay] of [[x1, y1], [x2, y2], [x3, y3]] as Array<[number, number]>) {
          ctx.beginPath()
          ctx.arc(bx(ax), by(ay), r, 0, Math.PI * 2)
          ctx.fill()
        }

        // 扩展水平线:price = C + (B - A) × level
        const dPrice = f.p2.price - f.p1.price
        for (const level of FIB_EXT_LEVELS) {
          const price = f.p3.price + dPrice * level
          const y = series.priceToCoordinate(price)
          if (y === null) continue
          ctx.globalAlpha = 0.45
          ctx.setLineDash(level === 0 ? [] : [2 * hrp, 2 * hrp])
          ctx.beginPath()
          ctx.moveTo(0, by(y))
          ctx.lineTo(bx(w), by(y))
          ctx.stroke()
        }
        ctx.setLineDash([])

        // 比例标签(靠右边缘)
        ctx.globalAlpha = 1
        ctx.font = `${10 * vrp}px "DM Sans", sans-serif`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        for (const level of FIB_EXT_LEVELS) {
          const price = f.p3.price + dPrice * level
          const y = series.priceToCoordinate(price)
          if (y === null) continue
          ctx.fillText(pct(level), bx(w - 4), by(y))
        }

        // 悬停高亮:控制点外圈白色圆环
        if (f.id === hl) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2 * vrp
          const hr = 7 * vrp
          for (const [ax, ay] of [[x1, y1], [x2, y2], [x3, y3]] as Array<[number, number]>) {
            ctx.beginPath()
            ctx.arc(bx(ax), by(ay), hr, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
      }
      ctx.restore()
    })
  }
}
