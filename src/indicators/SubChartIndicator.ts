import {
  HistogramSeries,
  LineSeries,
  LineStyle,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type LineWidth,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts'
import type { IndicatorPoint, KlineBar } from '../types'
import {
  IndicatorAxisPrimitive,
  PaneLabelPrimitive,
  type IndicatorAxisState,
  type PaneLabelState,
} from './IndicatorAxis'

/** 副图 pane 相对主图的拉伸系数(主图默认 1)。缩小它降低副图默认高度,把更多空间让给主图 */
const SUB_CHART_STRETCH = 0.5

/** 单条输出线的用户可调样式(主图/副图共用);histogram 组件仅 color 生效 */
export interface IndicatorLineStyle {
  color: string
  width: LineWidth
  style: LineStyle
}

/** 副图指标可编辑参数(由 IndicatorController 从 config 派生传入;缺省时各 def 用自己的默认值) */
export interface SubChartParams {
  rsiPeriod?: number
  macdFast?: number
  macdSlow?: number
  macdSignal?: number
  kdjPeriod?: number
  kdjKSmooth?: number
  kdjDSmooth?: number
  wrPeriods?: number[]
  cciPeriod?: number
  atrPeriod?: number
  dmiPeriod?: number
}

/** 合并样式覆盖与默认:有覆盖用覆盖,否则用默认 */
export function mergeLineStyle(
  overrides: Partial<IndicatorLineStyle> | undefined,
  fallback: { color: string; width?: LineWidth; style?: LineStyle },
): IndicatorLineStyle {
  return {
    color: overrides?.color ?? fallback.color,
    width: overrides?.width ?? fallback.width ?? 1,
    style: overrides?.style ?? fallback.style ?? LineStyle.Solid,
  }
}

/** 副图指标组件(一条线或直方图) */
interface SubChartComponent {
  key: string
  color: string
  type: 'line' | 'histogram'
}

/** 副图指标定义 */
export interface SubChartIndicatorDef {
  id: string
  label: string
  components: SubChartComponent[]
  /** 计算:返回各组件序列(直方图组件可携带每点 color);参数取自 SubChartParams,缺省用定义默认 */
  calc: (
    bars: KlineBar[],
    params: SubChartParams,
  ) => Array<{ key: string; points: Array<IndicatorPoint & { color?: string }> }>
}

/**
 * 单个副图指标实例:管理自己的 series(独立 pane)、价格轴同色值标签、
 * 副图左上角角标(值按组件线色分段着色)、十字光标/最新值。
 * 被 IndicatorController 按开关创建/销毁。
 */
export class SubChartIndicator {
  private _chart: IChartApi
  private _def: SubChartIndicatorDef
  private _params: SubChartParams
  private _styles: Record<string, IndicatorLineStyle>
  private _series: Map<string, ISeriesApi<'Line' | 'Histogram'>> = new Map()
  private _anchor: ISeriesApi<'Line' | 'Histogram'> | null = null
  private _paneState: PaneLabelState = { item: null }
  private _panePrimitive: PaneLabelPrimitive | null = null
  private _axisState: IndicatorAxisState = { items: [] }
  private _axisPrimitive: IndicatorAxisPrimitive | null = null
  private _latest: Map<string, number | null> = new Map()

  constructor(
    chart: IChartApi,
    def: SubChartIndicatorDef,
    paneIndex: number,
    params: SubChartParams,
    styles?: Record<string, IndicatorLineStyle>,
  ) {
    this._chart = chart
    this._def = def
    this._params = params
    this._styles = styles ?? {}

    // 柱状图先创建,置于线条之下(lightweight-charts 后添加的 series 绘制在上层,会盖住先前的线条)
    const ordered = [...def.components].sort(
      (a, b) => Number(b.type === 'histogram') - Number(a.type === 'histogram'),
    )
    for (const c of ordered) {
      const eff = mergeLineStyle(this._styles[c.key], { color: c.color })
      const series =
        c.type === 'histogram'
          ? chart.addSeries(
              HistogramSeries,
              { color: eff.color, priceLineVisible: false, lastValueVisible: false },
              paneIndex,
            )
          : chart.addSeries(
              LineSeries,
              {
                color: eff.color,
                lineWidth: eff.width,
                lineStyle: eff.style,
                priceLineVisible: false,
                lastValueVisible: false,
              },
              paneIndex,
            )
      this._series.set(c.key, series)
    }
    this._anchor = this._series.values().next().value ?? null
    // 副图 pane 默认与主图等高,这里调低拉伸系数降低默认高度(重建时 pane 会重置,故每次构造都需设置)
    this._anchor?.getPane().setStretchFactor(SUB_CHART_STRETCH)
    // 副图价格轴:强制 autoScale 自适应数据区间(主图 autoScale=false 不影响副图渲染)
    this._anchor?.priceScale().applyOptions({ scaleMargins: { top: 0.12, bottom: 0.12 }, autoScale: true })

    if (this._anchor) {
      // 价格轴同色值标签(显示最新值)
      this._axisState.items = def.components.map((c) => ({ value: null, color: this._color(c.key, c.color) }))
      this._axisPrimitive = new IndicatorAxisPrimitive(this._anchor, this._axisState)
      this._anchor.attachPrimitive(this._axisPrimitive)

      // 副图左上角角标(值按组件线色分段着色)
      this._paneState.item = {
        segments: [{ text: def.label, color: this._color(def.components[0]?.key ?? '', def.components[0]?.color ?? '#d1d4dc') }],
      }
      this._panePrimitive = new PaneLabelPrimitive(this._paneState)
      this._anchor.attachPrimitive(this._panePrimitive)
    }
  }

  /** 数据变化:重算全部组件、更新价格轴标签最新值、记录最新值 */
  update(bars: KlineBar[]): void {
    const results = this._def.calc(bars, this._params)
    for (const c of this._def.components) {
      const series = this._series.get(c.key)
      const result = results.find((r) => r.key === c.key)
      if (!series || !result) continue
      if (c.type === 'histogram') {
        series.setData(result.points as HistogramData<Time>[])
      } else {
        series.setData(result.points as LineData<Time>[])
      }
      const latest = result.points.length > 0 ? result.points[result.points.length - 1].value : null
      this._latest.set(c.key, latest)
      const idx = this._def.components.indexOf(c)
      const axisItem = this._axisState.items[idx]
      if (axisItem) axisItem.value = latest
    }
    this._axisPrimitive?.requestUpdate?.()
  }

  /** 十字光标移动:更新副图左上角角标(十字线值优先,否则回退最新值,按组件线色着色) */
  applyCrosshair(param: MouseEventParams<Time>): void {
    const item = this._paneState.item
    if (!item) return
    const segments = [
      { text: this._def.label, color: this._color(this._def.components[0]?.key ?? '', this._def.components[0]?.color ?? '#d1d4dc') },
    ]
    for (const c of this._def.components) {
      const series = this._series.get(c.key)
      const data = series
        ? (param.seriesData.get(series) as LineData<Time> | HistogramData<Time> | undefined)
        : undefined
      const value = data && 'value' in data ? data.value : (this._latest.get(c.key) ?? null)
      if (value !== null) segments.push({ text: ` ${c.key} ${value.toFixed(2)}`, color: this._color(c.key, c.color) })
    }
    item.segments = segments
    this._panePrimitive?.requestUpdate?.()
  }

  /** 组件有效线色:样式覆盖优先,否则定义默认色 */
  private _color(key: string, fallback: string): string {
    return mergeLineStyle(this._styles[key], { color: fallback }).color
  }

  dispose(): void {
    if (this._anchor) {
      if (this._axisPrimitive) this._anchor.detachPrimitive(this._axisPrimitive)
      if (this._panePrimitive) this._anchor.detachPrimitive(this._panePrimitive)
    }
    for (const s of this._series.values()) this._chart.removeSeries(s)
    this._series.clear()
    this._axisPrimitive = null
    this._panePrimitive = null
    this._anchor = null
  }
}
