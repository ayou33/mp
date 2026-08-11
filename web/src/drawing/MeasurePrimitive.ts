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
 * 测量工具(自绘 MeasurePrimitive):两点之间画线段 + 标签框,
 * 动态显示价差 / 涨跌幅 / 区间 K 线根数(渲染时按当前锚点实时计算)。
 */

export interface MeasurePoint {
  time: Time
  price: number
}

export interface MeasureDrawing {
  id: number
  p1: MeasurePoint
  p2: MeasurePoint
  /** 归属(缺省 'user'):system 对象用户不可修改/删除 */
  source?: DrawingSource
}

export interface MeasureDataSource {
  /** 已完成的测量 */
  measures: MeasureDrawing[]
  /** 放置中的锚点(0/1 个) */
  pending: MeasurePoint[]
  /** 放置第 2 个锚点时跟随鼠标的预览 */
  preview: MeasurePoint | null
  /** 悬停高亮的测量 id(控制点放大高亮);null/undefined 不高亮 */
  highlight?: number | null
}

export const MEASURE_COLOR = '#4fc3f7'

/** 单个待渲染的测量(两个锚点;id 用于悬停高亮) */
export interface RenderMeasure {
  id: number
  p1: MeasurePoint
  p2: MeasurePoint
}

/** 基于 lightweight-charts v5 primitives API 的自绘测量工具 */
export class MeasurePrimitive implements ISeriesPrimitive<Time> {
  private _data: MeasureDataSource
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<'Candlestick', Time> | null = null
  private _paneView: MeasurePaneView

  /** 由 attached() 注入的官方重绘触发器 */
  requestUpdate: (() => void) | null = null

  constructor(data: MeasureDataSource) {
    this._data = data
    this._paneView = new MeasurePaneView(this)
  }

  get chart(): IChartApi | null {
    return this._chart
  }

  get series(): ISeriesApi<'Candlestick', Time> | null {
    return this._series
  }

  get data(): MeasureDataSource {
    return this._data
  }

  /** 当前需要渲染的所有测量(已完成 + 绘制中的) */
  renderMeasures(): RenderMeasure[] {
    const { measures, pending, preview } = this._data
    const out: RenderMeasure[] = measures.map((m) => ({ id: m.id, p1: m.p1, p2: m.p2 }))
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

class MeasurePaneView implements IPrimitivePaneView {
  private _renderer: MeasurePaneRenderer

  constructor(primitive: MeasurePrimitive) {
    this._renderer = new MeasurePaneRenderer(primitive)
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }
}

class MeasurePaneRenderer implements IPrimitivePaneRenderer {
  private _primitive: MeasurePrimitive

  constructor(primitive: MeasurePrimitive) {
    this._primitive = primitive
  }

  draw(target: CanvasRenderingTarget2D): void {
    const chart = this._primitive.chart
    const series = this._primitive.series
    if (!chart || !series) return
    const measures = this._primitive.renderMeasures()
    if (measures.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hrp = scope.horizontalPixelRatio
      const vrp = scope.verticalPixelRatio
      const bx = (x: number) => x * hrp
      const by = (y: number) => y * vrp
      const hl = this._primitive.data.highlight

      ctx.save()
      ctx.fillStyle = MEASURE_COLOR
      ctx.strokeStyle = MEASURE_COLOR
      ctx.lineWidth = 1.5 * vrp

      for (const m of measures) {
        const x1 = chart.timeScale().timeToCoordinate(m.p1.time)
        const y1 = series.priceToCoordinate(m.p1.price)
        const x2 = chart.timeScale().timeToCoordinate(m.p2.time)
        const y2 = series.priceToCoordinate(m.p2.price)
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue

        // 线段 + 锚点圆点
        ctx.beginPath()
        ctx.moveTo(bx(x1), by(y1))
        ctx.lineTo(bx(x2), by(y2))
        ctx.stroke()
        const r = 4 * vrp
        for (const [ax, ay] of [[x1, y1], [x2, y2]] as Array<[number, number]>) {
          ctx.beginPath()
          ctx.arc(bx(ax), by(ay), r, 0, Math.PI * 2)
          ctx.fill()
        }

        // 测量标签框(线段中点上方)
        const label = buildMeasureLabel(m.p1, m.p2, chart)
        if (label) {
          this._drawLabel(ctx, bx((x1 + x2) / 2), by(Math.min(y1, y2) - 10), label, vrp, m.id === hl)
        }

        // 悬停高亮:控制点外圈白色圆环
        if (m.id === hl) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2 * vrp
          const hr = 7 * vrp
          for (const [ax, ay] of [[x1, y1], [x2, y2]] as Array<[number, number]>) {
            ctx.beginPath()
            ctx.arc(bx(ax), by(ay), hr, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
      }
      ctx.restore()
    })
  }

  /** 在 (x, y) 处画标签框(文本基线中点对齐;x 为框中心) */
  private _drawLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    vrp: number,
    highlighted: boolean,
  ): void {
    ctx.font = `${11 * vrp}px "DM Sans", sans-serif`
    const textW = ctx.measureText(text).width
    const pad = 5 * vrp
    const boxH = 18 * vrp
    const boxW = textW + pad * 2
    const boxX = x - boxW / 2
    const boxY = y - boxH / 2

    ctx.globalAlpha = 0.92
    ctx.fillStyle = 'rgba(19, 23, 34, 0.92)'
    ctx.fillRect(boxX, boxY, boxW, boxH)
    ctx.globalAlpha = 1
    ctx.strokeStyle = highlighted ? '#ffffff' : MEASURE_COLOR
    ctx.lineWidth = (highlighted ? 1.5 : 1) * vrp
    ctx.strokeRect(boxX, boxY, boxW, boxH)

    ctx.fillStyle = '#d1d4dc'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, boxY + boxH / 2)
  }
}

/** 组装测量标签文本:价差 + 涨跌幅 + 区间 K 线根数(红涨绿跌着色由文本符号表达) */
function buildMeasureLabel(p1: MeasurePoint, p2: MeasurePoint, chart: IChartApi): string | null {
  const l1 = chart.timeScale().timeToCoordinate(p1.time)
  const l2 = chart.timeScale().timeToCoordinate(p2.time)
  let bars = 0
  if (l1 !== null && l2 !== null) {
    const a = chart.timeScale().coordinateToLogical(l1)
    const b = chart.timeScale().coordinateToLogical(l2)
    if (a !== null && b !== null) bars = Math.abs(Math.round(b - a)) + 1
  }
  const diff = p2.price - p1.price
  const pct = p1.price !== 0 ? (diff / p1.price) * 100 : 0
  const sign = diff >= 0 ? '+' : ''
  return `Δ${sign}${diff.toFixed(2)} (${sign}${pct.toFixed(2)}%) · ${bars}根`
}
