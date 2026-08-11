import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  Time,
} from 'lightweight-charts'

/** 轴标签高度与内边距(CSS px),与指标值 label(IndicatorAxis)保持一致 */
const LABEL_HEIGHT = 17
/** 文本距盒左缘间距:10 = 库轴 label 的 tickSize(5)+paddingInner(5),保证文本与库绘 label 左对齐 */
const TEXT_X = 10
/** 盒右内边距(CSS px) */
const PAD_X = 8
const FONT_SIZE = 11

/**
 * 最新价(最后收盘价)价格轴标签 primitive(自绘,左对齐)。
 * 替代库内置右对齐的 lastValue label:蜡烛 series 设 `lastValueVisible: false` 后挂载本 primitive,
 * 在价格轴面板 x=2px 处画方标签,样式/位置与指标值 label(IndicatorAxis)一致。
 * 底色随最后一根 K 线阴阳(红涨绿跌,与 priceLineColor 同逻辑),文字为收盘价两位小数。
 * 不实现 requestUpdate:series 数据/价格刻度变化时库会重绘 pane view,label 自动跟随。
 */
export class LastPriceLabelPrimitive implements ISeriesPrimitive<Time> {
  private _view: LastPriceLabelPaneView

  constructor(series: ISeriesApi<'Candlestick'>, upColor: string, downColor: string) {
    this._view = new LastPriceLabelPaneView(series, upColor, downColor)
  }

  priceAxisPaneViews(): readonly IPrimitivePaneView[] {
    return [this._view]
  }
}

class LastPriceLabelPaneView implements IPrimitivePaneView {
  private _renderer: LastPriceLabelPaneRenderer

  constructor(series: ISeriesApi<'Candlestick'>, upColor: string, downColor: string) {
    this._renderer = new LastPriceLabelPaneRenderer(series, upColor, downColor)
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }
}

class LastPriceLabelPaneRenderer implements IPrimitivePaneRenderer {
  private _series: ISeriesApi<'Candlestick'>
  private _upColor: string
  private _downColor: string

  constructor(series: ISeriesApi<'Candlestick'>, upColor: string, downColor: string) {
    this._series = series
    this._upColor = upColor
    this._downColor = downColor
  }

  draw(target: CanvasRenderingTarget2D): void {
    const data = this._series.data()
    const last = data[data.length - 1]
    // 排除 WhitespaceData(仅 time 无 OHLC)
    if (!last || !('close' in last)) return
    const y = this._series.priceToCoordinate(last.close)
    if (y === null) return

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hrp = scope.horizontalPixelRatio
      const vrp = scope.verticalPixelRatio
      ctx.font = `${FONT_SIZE * vrp}px sans-serif`
      ctx.textBaseline = 'middle'

      const text = last.close.toFixed(2)
      const textW = ctx.measureText(text).width
      // 盒左缘 0、文本起始 TEXT_X=10,与库绘价格轴 label(tickSize5+paddingInner5)左对齐
      const labelW = TEXT_X * hrp + textW + PAD_X * hrp
      const x = 0
      const top = y * vrp - (LABEL_HEIGHT * vrp) / 2

      // 底色随最后一根 K 线阴阳(与 priceLineColor 一致)
      ctx.fillStyle = last.close >= last.open ? this._upColor : this._downColor
      ctx.fillRect(x, top, labelW, LABEL_HEIGHT * vrp)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(text, (x + TEXT_X) * hrp, y * vrp)
    })
  }
}
