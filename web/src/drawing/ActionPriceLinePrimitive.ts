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

/**
 * triggered 操作线确认条(画布实现):[已执行] [未执行] 依次排列、无间隔无圆角仅背景区分,
 * 垂直中线与价格线重合,右缘贴 pane 边缘(紧贴价格轴的类型 label,类型 label 仍在价格轴上)。
 * 固定宽保证绘制几何与工具侧命中测试(hitTestConfirm)一致。
 */
export const CONFIRM_BTN = {
  /** 确认条右缘距 pane 右缘(CSS px,0 = 紧贴价格轴 label) */
  right: 0,
  /**
   * 条高(CSS px):与价格轴 primitive 轴 label 绘制盒高一致——库按 `layout.fontSize`(默认 12)
   * + 上下额外内边距(2.5/12+2/12 各乘 fontSize)算得 12+4.5+4.5=21px。改布局字号需同步。
   */
  height: 21,
  /** 已执行/未执行块宽(CSS px) */
  widthBtn: 56,
} as const

/**
 * 计算与价格轴 primitive 轴 label 盒一致的垂直盒(bitmap px):镜像库 PriceAxisViewRenderer 的
 * 垂直定位舍入(yMid 四舍五入 + 盒高奇偶对齐)。自绘确认条用此定位,保证与库绘轴 label 像素级对齐。
 * yCss 为价格坐标(CSS px),height 为盒高(CSS px,与轴 label 盒高一致)。
 */
export function axisLabelBox(yCss: number, height: number, vrp: number): { top: number; height: number } {
  const yMidBitmap = Math.round(yCss * vrp) - Math.floor(vrp * 0.5)
  const tickHeightBitmap = Math.max(1, Math.floor(vrp))
  let hBitmap = Math.round(height * vrp)
  // 奇偶对齐:与 tick 高度同奇偶,保证中线落在像素网格上
  if (hBitmap % 2 !== tickHeightBitmap % 2) hBitmap += 1
  const top = Math.floor(yMidBitmap + tickHeightBitmap / 2 - hBitmap / 2)
  return { top, height: hBitmap }
}

/** 按钮字体:与全局字体栈一致 */
const CHIP_FONT_FAMILY = '"IBM Plex Sans Variable", sans-serif'

/** 呼吸动画:周期(ms)与 alpha 范围 */
const BREATH_PERIOD = 700
const BREATH_MIN = 0.45
const BREATH_AMP = 0.35

const VIOLATED_FILL = 'rgba(242, 54, 69, 0.20)'

/**
 * 操作价格线 primitive(自绘):基于水平价格线的生命周期对象。
 * - armed:按操作类型配色实线,悬停高亮白色虚线
 * - triggered:同色呼吸动画(alpha 随时钟脉动,primitive 只读时钟不碰数据源)+ 右侧确认条
 * - executed:白色细线 30% 透明(价格轴 label 附绿 ✓)
 * - violated:20% 透明红→透明渐变填充(向上触发填充到顶部 / 向下触发填充到底部)+ 细红虚线(价格轴 label 附红 ✕)
 * triggered+user 的确认条([✓已执行绿底] [✕未执行红底])画布绘制在右侧、垂直中线与价格线重合、
 * 无间隔无圆角仅背景区分,右缘贴 pane 边缘紧贴价格轴的类型 label(类型 label 仍在价格轴上显示)。
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
          // 白色细线 30% 透明(结果 ✓ 与操作类型由最左端 chip 呈现)
          ctx.globalAlpha = 0.3
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1 * vrp
          ctx.beginPath()
          ctx.moveTo(0, cy)
          ctx.lineTo(w * hrp, cy)
          ctx.stroke()
          ctx.globalAlpha = 1
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

        // 确认条(画布):triggered 且 user 对象,右侧紧贴价格轴 label、垂直盒与轴 label 对齐
        if (item.status === 'triggered' && item.source !== 'system') {
          this._drawConfirmButtons(ctx, hrp, vrp, w, y)
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

  /**
   * 绘制确认条:[已执行(绿底 ✓)] [未执行(红底 ✕)] 依次排列,右缘贴 pane 边缘紧贴价格轴的类型 label。
   * 无间隔、无圆角、仅背景区分;垂直盒用 axisLabelBox 与库绘价格轴 label 像素级对齐。
   * 仅 triggered 且 user 对象绘制;命中测试在工具侧 hitTestConfirm,几何必须与本方法一致(见 CONFIRM_BTN)。
   */
  private _drawConfirmButtons(
    ctx: CanvasRenderingContext2D,
    hrp: number,
    vrp: number,
    w: number,
    yCss: number,
  ): void {
    const c = CONFIRM_BTN
    const box = axisLabelBox(yCss, c.height, vrp) // 与库轴 label 盒顶/盒高完全一致
    const bw = c.widthBtn * hrp
    const rightEdge = (w - c.right) * hrp // 紧贴 pane 右缘(价格轴类型 label 由此起始)
    const notX = rightEdge - bw
    const yesX = notX - bw
    // 依次:已执行 | 未执行
    this._drawBlock(ctx, hrp, vrp, yesX, box.top, bw, box.height, '#089981', 'check', '已执行')
    this._drawBlock(ctx, hrp, vrp, notX, box.top, bw, box.height, '#f23645', 'cross', '未执行')
  }

  /** 单个实底块:无圆角,内容(可选 icon + 文字)整体居中,白字白 icon */
  private _drawBlock(
    ctx: CanvasRenderingContext2D,
    hrp: number,
    vrp: number,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    bg: string,
    icon: 'check' | 'cross' | null,
    text: string,
  ): void {
    ctx.globalAlpha = 1
    ctx.fillStyle = bg
    ctx.fillRect(bx, by, bw, bh)

    const midY = by + bh / 2
    ctx.fillStyle = '#ffffff'
    ctx.font = `600 ${11 * vrp}px ${CHIP_FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    if (icon) {
      // icon + 文字整体居中
      const iconSize = 11 * vrp
      const gap = 4 * hrp
      const textW = ctx.measureText(text).width
      const startX = bx + (bw - (iconSize + gap + textW)) / 2
      const iconCX = startX + iconSize / 2
      ctx.textAlign = 'left'
      if (icon === 'check') this._drawCheck(ctx, iconCX, midY, iconSize)
      else this._drawCross(ctx, iconCX, midY, iconSize)
      ctx.fillText(text, startX + iconSize + gap, midY)
    } else {
      ctx.textAlign = 'center'
      ctx.fillText(text, bx + bw / 2, midY)
    }
  }

  /** 白描边对勾 icon */
  private _drawCheck(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
    const s = size / 2
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(1.5, size * 0.17)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - s * 0.7, cy)
    ctx.lineTo(cx - s * 0.1, cy + s * 0.6)
    ctx.lineTo(cx + s * 0.9, cy - s * 0.7)
    ctx.stroke()
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
  }

  /** 白描边错号 icon */
  private _drawCross(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
    const s = size / 2
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(1.5, size * 0.17)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - s * 0.6, cy - s * 0.6)
    ctx.lineTo(cx + s * 0.6, cy + s * 0.6)
    ctx.moveTo(cx + s * 0.6, cy - s * 0.6)
    ctx.lineTo(cx - s * 0.6, cy + s * 0.6)
    ctx.stroke()
    ctx.lineCap = 'butt'
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
    // 轴 label 是纯文本,无法渲染 icon 路径,故只显示操作类型;确认状态由线条样式区分(executed 白细线 / violated 红虚线+填充)
    return ACTION_LABELS[this._item.action]
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
