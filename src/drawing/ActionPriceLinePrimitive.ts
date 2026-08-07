import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts'
import type { ActionDirection, ActionStatus, ActionType, DrawingSource } from './types'

// ---- 类型与常量 ----

/** 操作价格线运行时对象 */
export interface ActionLineItem {
  id: number
  /** 目标价 */
  price: number
  /** 期望操作(开仓/加仓/减仓/清仓) */
  action: ActionType
  /** 生命周期状态 */
  status: ActionStatus
  /** 触发方向(创建时按目标价 vs 最新收盘价确定;拖拽改价后重算) */
  direction: ActionDirection
  /** 创建时的最新 bar 时间('YYYY-MM-DD'),用于「未来第一次到达」跨刷新判定 */
  createdAt?: string
  /** 归属(缺省 'user') */
  source?: DrawingSource
}

/** 操作价格线数据源(由工具持有并就地变更,primitive 每次渲染读取) */
export interface ActionDataSource {
  items: ActionLineItem[]
  /** 悬停高亮 id(null/undefined 不高亮) */
  highlight?: number | null
}

/** 操作类型配色:开仓红 / 加仓黄 / 减仓蓝 / 清仓绿(实现时可微调) */
export const ACTION_COLORS: Record<ActionType, string> = {
  open: '#f23645',
  add: '#f0b90b',
  reduce: '#2962ff',
  close: '#089981',
}

export const ACTION_LABELS: Record<ActionType, string> = {
  open: '开仓',
  add: '加仓',
  reduce: '减仓',
  close: '清仓',
}

/** 状态在价格轴标签上的后缀(armed/triggered 无,executed/violated 加标记) */
export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  armed: '',
  triggered: '',
  executed: '✓',
  violated: '✕',
}

/** 呼吸动画:周期(ms)与 alpha 范围 */
const BREATH_PERIOD = 700
const BREATH_MIN = 0.45
const BREATH_AMP = 0.35

const VIOLATED_FILL = 'rgba(242, 54, 69, 0.20)'

/**
 * 操作价格线 primitive(自绘):基于水平价格线的生命周期对象。
 * - armed:按操作类型配色实线,悬停高亮白色虚线
 * - triggered:同色呼吸动画(alpha 随时钟脉动,primitive 只读时钟不碰数据源)
 * - executed:白色细线 30% 透明 + 最左侧上方绿色对勾
 * - violated:20% 透明红→透明渐变填充(向上触发填充到顶部 / 向下触发填充到底部)+ 细红虚线
 * 数据源引用语义同 FibonacciPrimitive:工具就地变更 data,状态变化后 requestUpdate。
 */
export class ActionPriceLinePrimitive implements ISeriesPrimitive<Time> {
  private _data: ActionDataSource
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<'Candlestick'> | null = null
  private _paneView: ActionPaneView
  private _axisViews: ActionAxisView[] = []
  private _signature = ''

  requestUpdate: (() => void) | null = null

  constructor(data: ActionDataSource) {
    this._data = data
    this._paneView = new ActionPaneView(this)
  }

  get chart(): IChartApi | null {
    return this._chart
  }

  get series(): ISeriesApi<'Candlestick'> | null {
    return this._series
  }

  get data(): ActionDataSource {
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
    this._axisViews = []
  }

  /** 只在集合结构/状态变化时重建轴标签(坐标在 AxisView 内动态读取,拖拽改价无需重建) */
  updateAllViews(): void {
    const sig = this._data.items.map((i) => `${i.id}:${i.status}`).join('|')
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
    this._axisViews = this._data.items.map((item) => new ActionAxisView(this, item))
  }
}

// ---- 主图画布渲染 ----

class ActionPaneView implements IPrimitivePaneView {
  private _primitive: ActionPriceLinePrimitive

  constructor(primitive: ActionPriceLinePrimitive) {
    this._primitive = primitive
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return new ActionPaneRenderer(this._primitive)
  }
}

class ActionPaneRenderer implements IPrimitivePaneRenderer {
  private _primitive: ActionPriceLinePrimitive

  constructor(primitive: ActionPriceLinePrimitive) {
    this._primitive = primitive
  }

  draw(target: CanvasRenderingTarget2D): void {
    const chart = this._primitive.chart
    const series = this._primitive.series
    if (!chart || !series) return
    const items = this._primitive.data.items
    if (items.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hrp = scope.horizontalPixelRatio
      const vrp = scope.verticalPixelRatio
      const w = scope.mediaSize.width
      const h = scope.mediaSize.height
      const hl = this._primitive.data.highlight
      const t = performance.now()

      for (const item of items) {
        const y = series.priceToCoordinate(item.price)
        if (y === null) continue
        const cy = y * vrp
        const color = ACTION_COLORS[item.action]

        if (item.status === 'armed') {
          ctx.globalAlpha = 1
          ctx.strokeStyle = color
          ctx.lineWidth = 2 * vrp
          ctx.beginPath()
          ctx.moveTo(0, cy)
          ctx.lineTo(w * hrp, cy)
          ctx.stroke()
        } else if (item.status === 'triggered') {
          // 呼吸动画:alpha 随时钟脉动
          const a = BREATH_MIN + BREATH_AMP * (0.5 - 0.5 * Math.cos(((t % BREATH_PERIOD) / BREATH_PERIOD) * Math.PI * 2))
          ctx.globalAlpha = a
          ctx.strokeStyle = color
          ctx.lineWidth = 2 * vrp
          ctx.beginPath()
          ctx.moveTo(0, cy)
          ctx.lineTo(w * hrp, cy)
          ctx.stroke()
        } else if (item.status === 'executed') {
          // 白色细线 30% 透明
          ctx.globalAlpha = 0.3
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1 * vrp
          ctx.beginPath()
          ctx.moveTo(0, cy)
          ctx.lineTo(w * hrp, cy)
          ctx.stroke()
          // 最左侧线条上方绿色对勾
          ctx.globalAlpha = 1
          ctx.strokeStyle = '#00e676'
          ctx.lineWidth = 2 * vrp
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          const bx = 10 * hrp
          const by = cy - 10 * vrp
          ctx.beginPath()
          ctx.moveTo(bx, by)
          ctx.lineTo(bx + 3 * hrp, by + 4 * vrp)
          ctx.lineTo(bx + 7 * hrp, by - 2 * vrp)
          ctx.stroke()
          ctx.lineCap = 'butt'
          ctx.lineJoin = 'miter'
        } else if (item.status === 'violated') {
          // 渐变填充:向上触发 → 价格线填充到顶部;向下触发 → 填充到底部。
          // createLinearGradient 坐标是 bitmap 像素(已乘 pixelRatio)
          const isUp = item.direction === 'up'
          if (isUp) {
            const g = ctx.createLinearGradient(0, cy, 0, 0)
            g.addColorStop(0, VIOLATED_FILL)
            g.addColorStop(1, 'rgba(242, 54, 69, 0)')
            ctx.fillStyle = g
            ctx.fillRect(0, 0, w * hrp, cy)
          } else {
            const g = ctx.createLinearGradient(0, cy, 0, h * vrp)
            g.addColorStop(0, VIOLATED_FILL)
            g.addColorStop(1, 'rgba(242, 54, 69, 0)')
            ctx.fillStyle = g
            ctx.fillRect(0, cy, w * hrp, h * vrp - cy)
          }
          // 细红虚线
          ctx.globalAlpha = 1
          ctx.strokeStyle = 'rgba(242, 54, 69, 0.7)'
          ctx.lineWidth = 1 * vrp
          ctx.setLineDash([2 * hrp, 2 * hrp])
          ctx.beginPath()
          ctx.moveTo(0, cy)
          ctx.lineTo(w * hrp, cy)
          ctx.stroke()
          ctx.setLineDash([])
        }

        // 悬停高亮(armed):白色虚线叠加
        if (item.id === hl && item.status === 'armed') {
          ctx.globalAlpha = 0.8
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1 * vrp
          ctx.setLineDash([4 * hrp, 3 * hrp])
          ctx.beginPath()
          ctx.moveTo(0, cy)
          ctx.lineTo(w * hrp, cy)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }
      ctx.globalAlpha = 1
    })
  }
}

// ---- 价格轴标签 ----

/** 价格轴上的操作类型标签(状态后缀 + 操作类型文字,底色随操作类型) */
class ActionAxisView implements ISeriesPrimitiveAxisView {
  private _primitive: ActionPriceLinePrimitive
  private _item: ActionLineItem

  constructor(primitive: ActionPriceLinePrimitive, item: ActionLineItem) {
    this._primitive = primitive
    this._item = item
  }

  coordinate(): number {
    const series = this._primitive.series
    if (!series) return -1
    return series.priceToCoordinate(this._item.price) ?? -1
  }

  text(): string {
    return `${ACTION_STATUS_LABEL[this._item.status]}${ACTION_LABELS[this._item.action]}`
  }

  textColor(): string {
    return '#ffffff'
  }

  backColor(): string {
    return ACTION_COLORS[this._item.action]
  }

  visible(): boolean {
    return true
  }
}
