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

export const HIGH_COLOR = '#f23645' // 红(与 A 股涨色一致)
export const LOW_COLOR = '#089981' // 绿(与 A 股跌色一致)

/** 可见区间高/低点标注(极值 bar 的时间 + 价格) */
export interface VisibleMarkPoint {
  time: Time
  price: number
}

/** 标注数据源(由控制器就地变更,primitive 每次渲染读取) */
export interface VisibleRangeMarkState {
  high: VisibleMarkPoint | null
  low: VisibleMarkPoint | null
}

const FONT_SIZE = 11
const LABEL_HEIGHT = 16
const PAD_X = 4
const DOT_R = 3
const LEADER_LEN = 22
const GAP = 4

/**
 * 可见区间最高/最低价标注 primitive(自绘):
 * 在极值 K 线的最高价/最低价处画小圆点 + 水平引线 + 文本价格标签(传统引线样式)。
 * 引线默认向右伸出,右侧放不下标签时自动改向左;不横跨全图,区别于 createPriceLine 的整条横线。
 * 数据源引用语义同 FibonacciPrimitive:控制器就地变更 state,state 变化后 requestUpdate。
 */
export class VisibleRangeMarkPrimitive implements ISeriesPrimitive<Time> {
  private _state: VisibleRangeMarkState
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<'Candlestick'> | null = null
  private _view: MarkPaneView

  requestUpdate: (() => void) | null = null

  constructor(state: VisibleRangeMarkState) {
    this._state = state
    this._view = new MarkPaneView(this)
  }

  get chart(): IChartApi | null {
    return this._chart
  }

  get series(): ISeriesApi<'Candlestick'> | null {
    return this._series
  }

  get state(): VisibleRangeMarkState {
    return this._state
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

class MarkPaneView implements IPrimitivePaneView {
  private _primitive: VisibleRangeMarkPrimitive

  constructor(primitive: VisibleRangeMarkPrimitive) {
    this._primitive = primitive
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return new MarkPaneRenderer(this._primitive)
  }
}

class MarkPaneRenderer implements IPrimitivePaneRenderer {
  private _primitive: VisibleRangeMarkPrimitive

  constructor(primitive: VisibleRangeMarkPrimitive) {
    this._primitive = primitive
  }

  draw(target: CanvasRenderingTarget2D): void {
    const chart = this._primitive.chart
    const series = this._primitive.series
    if (!chart || !series) return
    const { high, low } = this._primitive.state
    if (!high && !low) return

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hrp = scope.horizontalPixelRatio
      const vrp = scope.verticalPixelRatio
      const width = scope.mediaSize.width
      ctx.font = `${FONT_SIZE * vrp}px sans-serif`
      ctx.textBaseline = 'middle'

      const points: Array<{ time: Time; price: number; color: string; text: string }> = []
      if (high) points.push({ time: high.time, price: high.price, color: HIGH_COLOR, text: `高 ${high.price.toFixed(2)}` })
      if (low) points.push({ time: low.time, price: low.price, color: LOW_COLOR, text: `低 ${low.price.toFixed(2)}` })

      const dotR = DOT_R * vrp
      const gap = GAP * hrp
      const leaderLen = LEADER_LEN * hrp
      const padX = PAD_X * hrp
      const labelH = LABEL_HEIGHT * vrp

      for (const pt of points) {
        const x = chart.timeScale().timeToCoordinate(pt.time)
        const y = series.priceToCoordinate(pt.price)
        if (x === null || y === null) continue
        const bx = x * hrp
        const by = y * vrp

        const textW = ctx.measureText(pt.text).width
        const labelW = textW + 2 * padX

        // 引线方向:默认从圆点向右伸出,右侧放不下标签则改向左
        let leaderX1: number
        let leaderX2: number
        let labelX: number
        if (bx + dotR + leaderLen + gap + labelW <= width - 2 * hrp) {
          leaderX1 = bx + dotR
          leaderX2 = leaderX1 + leaderLen
          labelX = leaderX2 + gap
        } else {
          leaderX2 = bx - dotR
          leaderX1 = leaderX2 - leaderLen
          labelX = leaderX1 - gap - labelW
        }

        // 极值点圆点
        ctx.fillStyle = pt.color
        ctx.beginPath()
        ctx.arc(bx, by, dotR, 0, Math.PI * 2)
        ctx.fill()

        // 水平引线
        ctx.strokeStyle = pt.color
        ctx.lineWidth = 1 * vrp
        ctx.beginPath()
        ctx.moveTo(leaderX1, by)
        ctx.lineTo(leaderX2, by)
        ctx.stroke()

        // 标签背景(实色块 + 白字,与主图 MA 轴标签同风格)
        ctx.fillStyle = pt.color
        ctx.fillRect(labelX, by - labelH / 2, labelW, labelH)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(pt.text, labelX + padX, by)
      }
    })
  }
}
