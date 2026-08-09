import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'

/** 价格轴标签项(数值,value 为 null 时隐藏;颜色区分指标) */
export interface IndicatorAxisItem {
  value: number | null
  color: string
}

/** 价格轴标签的共享状态(控制器就地更新 value,primitive 每次渲染读取) */
export interface IndicatorAxisState {
  items: IndicatorAxisItem[]
}

/** 标签垂直高度(CSS px,含文字与内边距),用于不重叠布局 */
const LABEL_HEIGHT = 17

/**
 * 将按 y 排序的标签中心坐标调整为互不重叠:任一标签下边界不得越过上一标签上边界,
 * 最小间距为 0(紧贴),不可为负(不允许重叠)。
 */
export function resolveNonOverlap(sortedByY: number[], labelHeight = LABEL_HEIGHT): void {
  for (let i = 1; i < sortedByY.length; i++) {
    const minTop = sortedByY[i - 1] + labelHeight
    if (sortedByY[i] < minTop) sortedByY[i] = minTop
  }
}

/**
 * 主图价格轴指标值标签 primitive(自绘方形标签,无圆角)。
 * 值定位在指标值对应的价格坐标上,多个值按高低排序、不重叠排列(最小间距 0)。
 */
export class IndicatorAxisPrimitive implements ISeriesPrimitive<Time> {
  private _view: IndicatorAxisPaneView

  requestUpdate: (() => void) | null = null

  constructor(series: ISeriesApi<SeriesType>, state: IndicatorAxisState) {
    this._view = new IndicatorAxisPaneView(series, state)
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.requestUpdate = null
  }

  priceAxisPaneViews(): readonly IPrimitivePaneView[] {
    return [this._view]
  }
}

class IndicatorAxisPaneView implements IPrimitivePaneView {
  private _renderer: IndicatorAxisPaneRenderer

  constructor(series: ISeriesApi<SeriesType>, state: IndicatorAxisState) {
    this._renderer = new IndicatorAxisPaneRenderer(series, state)
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }
}

class IndicatorAxisPaneRenderer implements IPrimitivePaneRenderer {
  private _series: ISeriesApi<SeriesType>
  private _state: IndicatorAxisState
  private _fontSize = 11
  /** 文本距盒左缘间距:10 = 库轴 label 的 tickSize(5)+paddingInner(5),保证文本与库绘 label 左对齐 */
  private _padX = 10

  constructor(series: ISeriesApi<SeriesType>, state: IndicatorAxisState) {
    this._series = series
    this._state = state
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hrp = scope.horizontalPixelRatio
      const vrp = scope.verticalPixelRatio
      ctx.font = `${this._fontSize * vrp}px sans-serif`

      // 收集可见标签并按 y 排序
      const labels: Array<{ item: IndicatorAxisItem; text: string; y: number }> = []
      for (const item of this._state.items) {
        if (item.value === null) continue
        const y = this._series.priceToCoordinate(item.value)
        if (y === null) continue
        labels.push({ item, text: item.value.toFixed(2), y })
      }
      if (labels.length === 0) return

      labels.sort((a, b) => a.y - b.y)
      const ys = labels.map((l) => l.y)
      resolveNonOverlap(ys, LABEL_HEIGHT)
      labels.forEach((l, i) => {
        l.y = ys[i]
      })

      // 绘制方形标签(无圆角),样式与最新价格标签一致;盒左缘 0、文本起始 10,与库绘轴 label 左对齐
      const labelH = LABEL_HEIGHT * vrp
      const padX = this._padX * hrp
      ctx.textBaseline = 'middle'
      for (const { item, text, y } of labels) {
        const textW = ctx.measureText(text).width
        const labelW = textW + 2 * padX
        const x = 0 // 盒左缘与库轴 label 一致(库含 tick 区)
        const top = y * vrp - labelH / 2
        ctx.fillStyle = item.color
        ctx.fillRect(x, top, labelW, labelH)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(text, x + padX, y * vrp)
      }
    })
  }
}

// ---- 副图左上角指标值标签 ----

/** 副图左上角标签的一段(不同组件用各自颜色) */
export interface PaneLabelSegment {
  text: string
  color: string
}

/** 副图左上角标签项(分段着色) */
export interface PaneLabelItem {
  segments: PaneLabelSegment[]
}

export interface PaneLabelState {
  item: PaneLabelItem | null
}

/** 在所在 pane 的左上角绘制指标标签(如副图 RSI 的 "RSI 55.32") */
export class PaneLabelPrimitive implements ISeriesPrimitive<Time> {
  private _view: PaneLabelPaneView

  requestUpdate: (() => void) | null = null

  constructor(state: PaneLabelState) {
    this._view = new PaneLabelPaneView(state)
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.requestUpdate = null
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._view]
  }
}

class PaneLabelPaneView implements IPrimitivePaneView {
  private _renderer: PaneLabelPaneRenderer

  constructor(state: PaneLabelState) {
    this._renderer = new PaneLabelPaneRenderer(state)
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }
}

class PaneLabelPaneRenderer implements IPrimitivePaneRenderer {
  private _state: PaneLabelState

  constructor(state: PaneLabelState) {
    this._state = state
  }

  draw(target: CanvasRenderingTarget2D): void {
    const item = this._state.item
    if (!item || item.segments.length === 0) return
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hrp = scope.horizontalPixelRatio
      const vrp = scope.verticalPixelRatio
      ctx.font = `${11 * vrp}px sans-serif`
      // 预留左上角位置:距离左上角一定偏移,参考主图 MA 图例
      let x = 8 * hrp
      const y = 18 * vrp
      for (const seg of item.segments) {
        ctx.fillStyle = seg.color
        ctx.fillText(seg.text, x, y)
        x += ctx.measureText(seg.text).width
      }
    })
  }
}
