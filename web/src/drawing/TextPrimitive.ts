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

/** 文本标注工具:单点放置的文字标签(自绘 TextPrimitive),锚点在标签框左中。 */

export interface TextItem {
  id: number
  time: Time
  price: number
  /** 标注文本内容 */
  text: string
  /** 归属(缺省 'user'):system 对象用户不可修改/删除 */
  source?: DrawingSource
}

export interface TextDataSource {
  items: TextItem[]
  /** 悬停高亮的 id;null/undefined 不高亮 */
  highlight?: number | null
}

export const TEXT_COLOR = '#d1d4dc'
const TEXT_FONT_FAMILY = '"DM Sans", sans-serif'
const TEXT_FONT_SIZE = 12

/** 基于 lightweight-charts v5 primitives API 的自绘文本标注 */
export class TextPrimitive implements ISeriesPrimitive<Time> {
  private _data: TextDataSource
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<'Candlestick', Time> | null = null
  private _paneView: TextPaneView

  /** 由 attached() 注入的官方重绘触发器 */
  requestUpdate: (() => void) | null = null

  constructor(data: TextDataSource) {
    this._data = data
    this._paneView = new TextPaneView(this)
  }

  get chart(): IChartApi | null {
    return this._chart
  }

  get series(): ISeriesApi<'Candlestick', Time> | null {
    return this._series
  }

  get data(): TextDataSource {
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

class TextPaneView implements IPrimitivePaneView {
  private _renderer: TextPaneRenderer

  constructor(primitive: TextPrimitive) {
    this._renderer = new TextPaneRenderer(primitive)
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }
}

class TextPaneRenderer implements IPrimitivePaneRenderer {
  private _primitive: TextPrimitive

  constructor(primitive: TextPrimitive) {
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
      const bx = (x: number) => x * hrp
      const by = (y: number) => y * vrp
      const hl = this._primitive.data.highlight

      ctx.font = `${TEXT_FONT_SIZE * vrp}px ${TEXT_FONT_FAMILY}`
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'

      for (const item of items) {
        const x = chart.timeScale().timeToCoordinate(item.time)
        const y = series.priceToCoordinate(item.price)
        if (x === null || y === null) continue
        const text = item.text || ''
        const highlighted = item.id === hl

        // 标签框尺寸(锚点在框左中,向右展开)
        const pad = 4 * vrp
        const boxH = TEXT_FONT_SIZE * vrp + 4 * vrp
        const textW = ctx.measureText(text).width
        const boxW = textW + pad * 2
        const boxX = bx(x)
        const boxY = by(y) - boxH / 2

        // 半透明面板底 + 细描边;悬停时描边提亮
        ctx.fillStyle = 'rgba(30, 34, 45, 0.92)'
        ctx.fillRect(boxX, boxY, boxW, boxH)
        ctx.strokeStyle = highlighted ? '#ffffff' : TEXT_COLOR
        ctx.lineWidth = (highlighted ? 1.5 : 1) * vrp
        ctx.strokeRect(boxX, boxY, boxW, boxH)

        // 文本
        ctx.fillStyle = TEXT_COLOR
        ctx.fillText(text, boxX + pad, boxY + boxH / 2)
      }
    })
  }
}
