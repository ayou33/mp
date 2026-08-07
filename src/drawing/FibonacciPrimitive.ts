import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts'
import type { DrawingSource } from './types'

// ---- 斐波那契类型与常量 ----

/** 斐波那契回调的锚点 */
export interface FibPoint {
  time: Time
  price: number
}

/** 已完成的斐波那契(带唯一 id;控制点 p1/p2 可参数化直接读写) */
export interface FibDrawing {
  id: number
  p1: FibPoint
  p2: FibPoint
  /** 归属(缺省 'user'):system 对象用户不可修改/删除 */
  source?: DrawingSource
}

/** 斐波那契绘制的数据源(由 DrawingTools 持有并就地变更,primitive 每次渲染时读取) */
export interface FibDataSource {
  /** 已完成的斐波那契 */
  fibs: FibDrawing[]
  /** 绘制中的锚点(0 / 1 / 2 个) */
  pending: FibPoint[]
  /** 放置第 2 个锚点时跟随鼠标的预览位置 */
  preview: FibPoint | null
  /** 悬停高亮的斐波那契 id(控制点放大高亮);null/undefined 不高亮 */
  highlight?: number | null
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const
export const FIB_COLOR = '#b685f0'

/** 0.236 -> "23.6%", 0.5 -> "50%", 1 -> "100%" */
const pct = (r: number) => `${(r * 100).toFixed(1).replace(/\.0$/, '')}%`

/** 单个待渲染的斐波那契(两个锚点;id 用于悬停高亮) */
export interface RenderFib {
  id: number
  p1: FibPoint
  p2: FibPoint
}

// ---- primitive 类 ----

/** 基于 lightweight-charts v5 primitives API 的自绘斐波那契回调工具 */
export class FibonacciPrimitive implements ISeriesPrimitive<Time> {
  private _data: FibDataSource
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<'Candlestick', Time> | null = null
  private _paneView: FibPaneView
  private _axisViews: FibAxisView[] = []
  private _signature = ''

  /** 由 attached() 注入的官方重绘触发器 */
  requestUpdate: (() => void) | null = null

  constructor(data: FibDataSource) {
    this._data = data
    this._paneView = new FibPaneView(this)
  }

  get chart(): IChartApi | null {
    return this._chart
  }

  get series(): ISeriesApi<'Candlestick', Time> | null {
    return this._series
  }

  get data(): FibDataSource {
    return this._data
  }

  /** 当前需要渲染的所有斐波那契(已完成 + 绘制中的) */
  renderFibs(): RenderFib[] {
    const { fibs, pending, preview } = this._data
    const out: RenderFib[] = fibs.map((f) => ({ id: f.id, p1: f.p1, p2: f.p2 }))
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
    this._axisViews = []
  }

  updateAllViews(): void {
    // 只在集合结构变化时重建轴标签(拖拽改价时锚点对象被就地变更,坐标动态读取)
    const sig = `${this._data.fibs.length}:${this._data.pending.length}:${this._data.preview ? 1 : 0}`
    if (sig !== this._signature) {
      this._signature = sig
      this._rebuildAxisViews()
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView]
  }

  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._axisViews
  }

  private _rebuildAxisViews(): void {
    const views: FibAxisView[] = []
    for (const fib of this.renderFibs()) {
      for (const level of FIB_LEVELS) {
        views.push(new FibAxisView(this, fib, level))
      }
    }
    this._axisViews = views
  }
}

// ---- 主图画布渲染 ----

/** 主图画布上的渲染:锚点虚线、连线、端点、斐波那契回调水平线 */
class FibPaneRenderer implements IPrimitivePaneRenderer {
  private _primitive: FibonacciPrimitive

  constructor(primitive: FibonacciPrimitive) {
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
      const h = scope.mediaSize.height
      const bx = (x: number) => x * hrp
      const by = (y: number) => y * vrp

      ctx.save()
      ctx.strokeStyle = FIB_COLOR
      ctx.fillStyle = FIB_COLOR
      ctx.lineWidth = 1.5 * vrp
      const hl = this._primitive.data.highlight

      for (const fib of fibs) {
        const x1 = chart.timeScale().timeToCoordinate(fib.p1.time)
        const y1 = series.priceToCoordinate(fib.p1.price)
        const x2 = chart.timeScale().timeToCoordinate(fib.p2.time)
        const y2 = series.priceToCoordinate(fib.p2.price)
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue

        // 锚点竖向虚线(贯穿整个高度)
        ctx.globalAlpha = 0.5
        ctx.setLineDash([3 * hrp, 3 * hrp])
        this.line(ctx, bx(x1), 0, bx(x1), by(h))
        this.line(ctx, bx(x2), 0, bx(x2), by(h))
        ctx.setLineDash([])

        // 锚点之间连线 + 端点圆点
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.moveTo(bx(x1), by(y1))
        ctx.lineTo(bx(x2), by(y2))
        ctx.stroke()
        const r = 4 * vrp
        ctx.beginPath()
        ctx.arc(bx(x1), by(y1), r, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(bx(x2), by(y2), r, 0, Math.PI * 2)
        ctx.fill()
        // 悬停高亮:控制点外圈白色圆环
        if (fib.id === hl) {
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

        // 斐波那契回调水平线(贯穿整个宽度)
        const lo = Math.min(fib.p1.price, fib.p2.price)
        const hi = Math.max(fib.p1.price, fib.p2.price)
        for (const level of FIB_LEVELS) {
          const price = hi - (hi - lo) * level
          const y = series.priceToCoordinate(price)
          if (y === null) continue
          ctx.globalAlpha = 0.45
          ctx.setLineDash(level === 0 || level === 1 ? [] : [2 * hrp, 2 * hrp])
          ctx.beginPath()
          ctx.moveTo(0, by(y))
          ctx.lineTo(bx(w), by(y))
          ctx.stroke()
        }
        ctx.setLineDash([])
      }
      ctx.restore()
    })
  }

  private line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
}

/** 主图视图壳:返回固定渲染器 */
class FibPaneView implements IPrimitivePaneView {
  private _renderer: FibPaneRenderer

  constructor(primitive: FibonacciPrimitive) {
    this._renderer = new FibPaneRenderer(primitive)
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }
}

// ---- 价格轴标签 ----

/** 价格轴上的斐波那契百分比标签 */
class FibAxisView implements ISeriesPrimitiveAxisView {
  private _primitive: FibonacciPrimitive
  private _fib: RenderFib
  private _level: number

  constructor(primitive: FibonacciPrimitive, fib: RenderFib, level: number) {
    this._primitive = primitive
    this._fib = fib
    this._level = level
  }

  coordinate(): number {
    const series = this._primitive.series
    if (!series) return -1
    const lo = Math.min(this._fib.p1.price, this._fib.p2.price)
    const hi = Math.max(this._fib.p1.price, this._fib.p2.price)
    const price = hi - (hi - lo) * this._level
    return series.priceToCoordinate(price) ?? -1
  }

  text(): string {
    return pct(this._level)
  }

  textColor(): string {
    return '#ffffff'
  }

  backColor(): string {
    return FIB_COLOR
  }

  visible(): boolean {
    return true
  }
}
