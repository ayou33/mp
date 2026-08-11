import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type AreaData,
  type BarData,
  type BaselineData,
  type CandlestickData,
  type CustomData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type SeriesType,
  type Time,
} from 'lightweight-charts'
import type { IndicatorPoint, KlineBar } from '../../types'
import { IndicatorAxisPrimitive, PaneLabelPrimitive, type IndicatorAxisState, type PaneLabelState } from '../IndicatorAxis'
import { mergeLineStyle, type IndicatorLineStyle } from '../SubChartIndicator'
import { BandPrimitive, type BandState } from './BandPrimitive'
import { createCalcContext } from './calcContext'
import { resolveParams } from './defineIndicator'
import type { CustomIndicatorConfigEntry, CustomIndicatorDef, CustomOutput, CustomParamValues, CustomScale } from './types'

/** 副图 pane 相对主图的拉伸系数(与内置副图一致) */
const SUB_CHART_STRETCH = 0.5

/** 副图价格轴边距(与内置副图一致) */
const SUB_MARGINS = { top: 0.12, bottom: 0.12 }

/** 独立 Y 轴边距(与所在 pane 主轴解耦,自适配) */
const INDEP_MARGINS = { top: 0.15, bottom: 0.15 }

/** 单条输出线在实例内的静态元数据(跨 update 稳定;band 拆上下两轨) */
interface BuiltOutput {
  outputKey: string
  label: string
  type: CustomOutput['type']
  series: ISeriesApi<SeriesType> | null
  /** band 的下轨 series */
  bandLower: ISeriesApi<'Line'> | null
  /** 有效样式 */
  style: IndicatorLineStyle
}

/** 计算输出 key 的 scale 分配(配置覆盖优先,否则 def 输出默认,否则 right) */
function effectiveScale(
  def: CustomIndicatorDef,
  config: CustomIndicatorConfigEntry,
  outputKey: string,
): CustomScale {
  return config.scales?.[outputKey] ?? def.outputs.find((o) => o.key === outputKey)?.scale ?? { kind: 'right' }
}

/**
 * 单个自定义指标实例(非 React):按 def.outputs 创建 series(7 种形态),渲染价格轴标签/副图角标,
 * 支持多 Y 轴(独立 priceScaleId),十字光标/最新值双路图例,就地更新状态(坑 1)。
 * 由 CustomIndicatorManager 按启用状态创建/销毁;配置变化(参数/样式/scale/挂载位置)时销毁重建。
 */
export class CustomIndicatorInstance {
  private _chart: IChartApi
  private _def: CustomIndicatorDef
  private _params: CustomParamValues
  private _paneIndex: number | null
  private _built: BuiltOutput[] = []
  private _anchor: ISeriesApi<SeriesType> | null = null
  /** 各 Y 轴的轴标签状态(key = scale id;同 pane 同 id 共享一组标签) */
  private _axisByScale = new Map<string, { state: IndicatorAxisState; primitive: IndicatorAxisPrimitive | null; series: ISeriesApi<SeriesType> }>()
  private _bandByKey = new Map<string, { state: BandState; primitive: BandPrimitive; upper: ISeriesApi<'Line'>; lower: ISeriesApi<'Line'> }>()
  private _paneState: PaneLabelState = { item: null }
  private _panePrimitive: PaneLabelPrimitive | null = null
  /** 十字光标当前值(输出 key → 值;null = 该输出在十字线处无数据) */
  private _crossValues = new Map<string, number | null>()
  /** 最新值(输出 key → 值) */
  private _latest = new Map<string, number | null>()

  constructor(
    chart: IChartApi,
    def: CustomIndicatorDef,
    config: CustomIndicatorConfigEntry,
    paneIndex: number | null,
  ) {
    this._chart = chart
    this._def = def
    this._params = resolveParams(def, config.params)
    this._paneIndex = paneIndex

    // 创建顺序:band/histogram 先建(在下层),其余后建(在上层)——lightweight-charts 后添加的 series 绘制在上层
    const ordered = [...def.outputs].sort((a, b) => {
      const rank = (t: CustomOutput['type']): number => (t === 'band' ? 0 : t === 'histogram' ? 1 : 2)
      return rank(a.type) - rank(b.type)
    })

    for (const meta of ordered) {
      // visible=false 的输出不渲染(不建 series/图例/轴标签),但仍参与求值可被引用
      if (meta.visible === false) continue
      const style = mergeLineStyle(config.lineStyles[meta.key], {
        color: meta.color ?? '#d1d4dc',
        width: meta.width,
        style: meta.style,
      })
      const scale = effectiveScale(def, config, meta.key)
      const scaleId = scale.kind === 'independent' ? scale.id : 'right'
      const paneIdx = paneIndex ?? 0

      let series: ISeriesApi<SeriesType> | null = null
      let bandLower: ISeriesApi<'Line'> | null = null

      if (meta.type === 'band') {
        // 上下轨两条线 + BandPrimitive 填充(附着在上轨)
        const upper = this._chart.addSeries(
          LineSeries,
          { priceScaleId: scaleId, color: style.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
          paneIdx,
        )
        const lower = this._chart.addSeries(
          LineSeries,
          { priceScaleId: scaleId, color: style.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
          paneIdx,
        )
        const state: BandState = { upper: [], lower: [], upperColor: style.color, lowerColor: style.color, opacity: 0.15 }
        const primitive = new BandPrimitive(chart, upper, lower, state)
        upper.attachPrimitive(primitive)
        this._bandByKey.set(meta.key, { state, primitive, upper, lower })
        series = upper
        bandLower = lower
      } else {
        series = this._createSeries(meta.type, style, scaleId, paneIdx)
      }

      this._built.push({ outputKey: meta.key, label: meta.label, type: meta.type, series, bandLower, style })
    }

    this._anchor = this._built[0]?.series ?? null

    // 每个 scale 一组轴标签(该 scale 的第一条 series 作为 anchor 附着)
    for (const built of this._built) {
      if (!built.series) continue
      const scaleId = built.series.options().priceScaleId ?? 'right'
      if (this._axisByScale.has(scaleId)) continue
      const state: IndicatorAxisState = { items: [] }
      const primitive = new IndicatorAxisPrimitive(built.series, state)
      built.series.attachPrimitive(primitive)
      this._axisByScale.set(scaleId, { state, primitive, series: built.series })
    }

    // 副图:左上角标 + 独立拉伸
    if (paneIndex !== null && this._anchor) {
      this._paneState.item = { segments: [{ text: def.title, color: this._built[0]?.style.color ?? '#d1d4dc' }] }
      this._panePrimitive = new PaneLabelPrimitive(this._paneState)
      this._anchor.attachPrimitive(this._panePrimitive)
      this._anchor.getPane().setStretchFactor(SUB_CHART_STRETCH)
    }

    this._applyScaleOptions()
  }

  /** 按输出类型创建 series(带样式与 scale 选项) */
  private _createSeries(
    type: CustomOutput['type'],
    style: IndicatorLineStyle,
    scaleId: string,
    paneIdx: number,
  ): ISeriesApi<SeriesType> {
    const base = { priceScaleId: scaleId, priceLineVisible: false, lastValueVisible: false }
    switch (type) {
      case 'line':
        return this._chart.addSeries(
          LineSeries,
          { ...base, color: style.color, lineWidth: style.width, lineStyle: style.style },
          paneIdx,
        )
      case 'area':
        return this._chart.addSeries(
          AreaSeries,
          {
            ...base,
            lineColor: style.color,
            topColor: hexA(style.color, 0.28),
            bottomColor: hexA(style.color, 0.02),
          },
          paneIdx,
        )
      case 'histogram':
        return this._chart.addSeries(
          HistogramSeries,
          { ...base, color: style.color, base: 0 },
          paneIdx,
        )
      case 'baseline':
        return this._chart.addSeries(
          BaselineSeries,
          {
            ...base,
            topLineColor: style.color,
            bottomLineColor: style.color,
            topFillColor1: hexA(style.color, 0.28),
            topFillColor2: hexA(style.color, 0.05),
            bottomFillColor1: hexA(style.color, 0.05),
            bottomFillColor2: hexA(style.color, 0.28),
            lineWidth: style.width,
            lineStyle: style.style,
          },
          paneIdx,
        )
      case 'candlestick':
        return this._chart.addSeries(
          CandlestickSeries,
          {
            ...base,
            upColor: style.color,
            downColor: style.color,
            borderUpColor: style.color,
            borderDownColor: style.color,
            wickUpColor: style.color,
            wickDownColor: style.color,
          },
          paneIdx,
        )
      case 'bar':
        return this._chart.addSeries(
          BarSeries,
          { ...base, upColor: style.color, downColor: style.color },
          paneIdx,
        )
      case 'band':
        // band 在构造器中单独处理(双线 + BandPrimitive),不会走到这里
        throw new Error('[custom] band 不在 _createSeries 中创建 series')
      default:
        throw new Error(`[custom] 未支持的输出类型:${type satisfies never}`)
    }
  }

  /** 设置各 Y 轴 autoScale/scaleMargins:right 轴沿用 pane 主轴,独立轴自适配 */
  private _applyScaleOptions(): void {
    for (const [, group] of this._axisByScale) {
      const ps = group.series.priceScale()
      if (this._paneIndex !== null) {
        // 副图:所有轴显式 autoScale(主图 right 轴 autoScale=false 是垂直拖动的代价,副图不受影响)
        ps.applyOptions({ scaleMargins: SUB_MARGINS, autoScale: true })
      } else if (group.series.options().priceScaleId !== 'right') {
        // 主图叠加:独立轴自适配 + 独立边距;right 轴与 K 线共享(autoScale=false 不动)
        ps.applyOptions({ scaleMargins: INDEP_MARGINS, autoScale: true })
      }
    }
  }

  /** 数据更新:重算全部输出 → setData,刷新轴标签最新值、副图角标、最新值缓存 */
  update(bars: KlineBar[]): void {
    const ctx = createCalcContext(bars)
    const outputs = this._def.calc(ctx, this._params)

    // 轴标签 items 按 scale 分组重建(仅 line/area/baseline/histogram 显示值标签)
    for (const [, group] of this._axisByScale) group.state.items = []

    for (const built of this._built) {
      const out = outputs.find((o) => o.key === built.outputKey)
      if (!out || !built.series) {
        this._latest.set(built.outputKey, null)
        continue
      }
      this._setSeriesData(built, out)
      this._latest.set(built.outputKey, latestValue(out))
      if (isLabelable(built.type)) {
        const group = this._axisByScale.get(built.series.options().priceScaleId ?? 'right')
        group?.state.items.push({ value: this._latest.get(built.outputKey) ?? null, color: built.style.color })
      }
    }

    this._refreshPaneLabel()
    for (const [, group] of this._axisByScale) group.primitive?.requestUpdate?.()
    this._panePrimitive?.requestUpdate?.()
  }

  /** 十字光标移动:输出值优先取十字线处数据,否则回退最新值;刷新副图角标 */
  applyCrosshair(param: MouseEventParams<Time>): void {
    for (const built of this._built) {
      if (!built.series) continue
      const data = param.seriesData.get(built.series)
      this._crossValues.set(built.outputKey, data ? valueOf(data) : null)
    }
    this._refreshPaneLabel()
    this._panePrimitive?.requestUpdate?.()
  }

  /** 图例条目:label 常显,value = 十字线值优先,否则最新值 */
  legendEntries(): Array<{ label: string; value: string | null; color: string }> {
    const out: Array<{ label: string; value: string | null; color: string }> = []
    for (const built of this._built) {
      const cross = this._crossValues.get(built.outputKey) ?? null
      const latest = this._latest.get(built.outputKey) ?? null
      const v = cross ?? latest
      if (v === null) continue
      out.push({ label: built.label, value: v.toFixed(2), color: built.style.color })
    }
    return out
  }

  /** 释放:detach primitives + 移除全部 series(独立轴随最后一条 series 移除自动消失) */
  dispose(): void {
    if (this._anchor) {
      if (this._panePrimitive) this._anchor.detachPrimitive(this._panePrimitive)
      for (const [, group] of this._axisByScale) {
        if (group.primitive) group.series.detachPrimitive(group.primitive)
      }
      for (const [, band] of this._bandByKey) {
        band.upper.detachPrimitive(band.primitive)
      }
    }
    for (const built of this._built) {
      if (built.series) this._chart.removeSeries(built.series)
      if (built.bandLower) this._chart.removeSeries(built.bandLower)
    }
    this._built = []
    this._axisByScale.clear()
    this._bandByKey.clear()
    this._anchor = null
    this._panePrimitive = null
  }

  // ---- 内部 ----

  private _setSeriesData(built: BuiltOutput, out: CustomOutput): void {
    const series = built.series
    if (!series) return
    switch (built.type) {
      case 'line':
        ;(series as ISeriesApi<'Line'>).setData((out as { data: IndicatorPoint[] }).data as LineData<Time>[])
        break
      case 'area':
        ;(series as ISeriesApi<'Area'>).setData((out as { data: IndicatorPoint[] }).data as AreaData<Time>[])
        break
      case 'histogram':
        ;(series as ISeriesApi<'Histogram'>).setData(
          (out as { data: Array<IndicatorPoint & { color?: string }> }).data as HistogramData<Time>[],
        )
        break
      case 'baseline': {
        const s = series as ISeriesApi<'Baseline'>
        const baseValue = (out as { baseValue?: number }).baseValue ?? 0
        s.setData((out as { data: IndicatorPoint[] }).data as BaselineData<Time>[])
        s.applyOptions({ baseValue: { type: 'price', price: baseValue } })
        break
      }
      case 'candlestick':
        ;(series as ISeriesApi<'Candlestick'>).setData(
          (out as { data: Array<{ time: string; open: number; high: number; low: number; close: number }> }).data as CandlestickData<Time>[],
        )
        break
      case 'bar':
        ;(series as ISeriesApi<'Bar'>).setData(
          (out as { data: Array<{ time: string; open: number; high: number; low: number; close: number }> }).data as BarData<Time>[],
        )
        break
      case 'band': {
        const b = out as { upper: IndicatorPoint[]; lower: IndicatorPoint[] }
        const band = this._bandByKey.get(built.outputKey)
        if (band) {
          // 就地更新状态(坑 1:不整体替换 primitive 捕获的对象)
          band.state.upper = b.upper
          band.state.lower = b.lower
          band.upper.setData(b.upper as LineData<Time>[])
          band.lower.setData(b.lower as LineData<Time>[])
        }
        break
      }
    }
  }

  /** 副图角标:十字线值优先,否则最新值,分段按输出线色 */
  private _refreshPaneLabel(): void {
    const item = this._paneState.item
    if (!item) return
    const segments = [{ text: this._def.title, color: this._built[0]?.style.color ?? '#d1d4dc' }]
    for (const built of this._built) {
      const cross = this._crossValues.get(built.outputKey) ?? null
      const latest = this._latest.get(built.outputKey) ?? null
      const v = cross ?? latest
      if (v === null) continue
      segments.push({ text: ` ${built.label} ${v.toFixed(2)}`, color: built.style.color })
    }
    item.segments = segments
  }
}

/** 该输出类型是否在轴上显示值标签(band/K 线/条形不显示) */
function isLabelable(type: CustomOutput['type']): boolean {
  return type === 'line' || type === 'area' || type === 'baseline' || type === 'histogram'
}

/** 取某数据点的数值(K 线/条形取 close;其余取 value) */
function valueOf(
  d:
    | LineData<Time>
    | HistogramData<Time>
    | CandlestickData<Time>
    | BarData<Time>
    | AreaData<Time>
    | BaselineData<Time>
    | CustomData<Time>,
): number | null {
  if ('value' in d && d.value !== undefined) return d.value
  if ('close' in d && d.close !== undefined) return d.close
  return null
}

/** 输出最新值(带 data 的取末项 value/close;band 取上轨末值) */
function latestValue(out: CustomOutput): number | null {
  switch (out.type) {
    case 'line':
    case 'area':
    case 'histogram':
    case 'baseline': {
      const d = out.data
      return d.length > 0 ? d[d.length - 1].value : null
    }
    case 'candlestick':
    case 'bar': {
      const d = out.data
      return d.length > 0 ? d[d.length - 1].close : null
    }
    case 'band': {
      return out.upper.length > 0 ? out.upper[out.upper.length - 1].value : null
    }
  }
}

/** 十六进制 → rgba(字符串透明;hex 支持 #rgb/#rrggbb/#rrggbbaa;带 alpha 的 hex 按比例叠加透明度) */
function hexA(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  if (full.length === 8) {
    const num = Number.parseInt(full, 16)
    if (Number.isNaN(num)) return hex
    const r = (num >> 24) & 255
    const g = (num >> 16) & 255
    const b = (num >> 8) & 255
    const a = (num & 255) / 255
    return `rgba(${r}, ${g}, ${b}, ${(a * alpha).toFixed(3)})`
  }
  const num = Number.parseInt(full, 16)
  if (Number.isNaN(num) || full.length !== 6) return hex
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
