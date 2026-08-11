import {
  BBI_COLOR,
  BOLL_BAND_COLOR,
  BOLL_MID_COLOR,
  EMA_COLORS,
  MA_COLORS,
  SUB_CHART_DEFS,
  type IndicatorConfig,
  type IndicatorId,
} from './IndicatorController'

/** 可编辑参数描述(编辑面板据此渲染输入;key 为 IndicatorConfig 字段) */
export interface IndicatorParamSpec {
  key: keyof IndicatorConfig
  label: string
  kind: 'number' | 'array'
  /** array 参数与输出线一一对应:每行「周期 + 该线样式(颜色/线宽/线型)」同行编辑(MA/EMA);缺省 false */
  inlineLines?: boolean
}

/** 单条输出线描述(编辑面板据此渲染线样式编辑) */
export interface IndicatorLineSpec {
  key: string
  label: string
  defaultColor: string
}

/** 单个指标的编辑面板元数据 */
export interface IndicatorEditorMeta {
  title: string
  params: IndicatorParamSpec[]
  /** 输出线列表(MA/EMA 随周期数组动态生成;其余静态) */
  lines: (config: IndicatorConfig) => IndicatorLineSpec[]
}

const arrayParam = (key: keyof IndicatorConfig, label: string): IndicatorParamSpec => ({ key, label, kind: 'array' })
/** 周期与输出线一一对应(每行周期 + 该线样式同行编辑) */
const inlineArrayParam = (key: keyof IndicatorConfig, label: string): IndicatorParamSpec => ({ key, label, kind: 'array', inlineLines: true })
const numParam = (key: keyof IndicatorConfig, label: string): IndicatorParamSpec => ({ key, label, kind: 'number' })

/** 副图 def 的输出线直接取自 components(key/默认色);标题与主图一致 */
const defLines =
  (id: string) =>
  (): IndicatorLineSpec[] => {
    const def = SUB_CHART_DEFS.find((e) => e.id === id)
    return def ? def.def.components.map((c) => ({ key: c.key, label: c.key, defaultColor: c.color })) : []
  }

/** 全部指标编辑面板元数据(编辑面板唯一数据源;默认线色须与 IndicatorController/subCharts 常量同步) */
export const INDICATOR_META: Record<IndicatorId, IndicatorEditorMeta> = {
  ma: {
    title: '均线 MA',
    params: [inlineArrayParam('maPeriods', '均线周期')],
    lines: (c) => c.maPeriods.map((p, i) => ({ key: String(i), label: `MA${p}`, defaultColor: MA_COLORS[i % MA_COLORS.length] })),
  },
  ema: {
    title: 'EMA',
    params: [inlineArrayParam('emaPeriods', 'EMA 周期')],
    lines: (c) => c.emaPeriods.map((p, i) => ({ key: String(i), label: `EMA${p}`, defaultColor: EMA_COLORS[i % EMA_COLORS.length] })),
  },
  boll: {
    title: 'BOLL',
    params: [numParam('bollPeriod', '周期'), numParam('bollStdDev', '标准差')],
    lines: () => [
      { key: 'upper', label: '上轨', defaultColor: BOLL_BAND_COLOR },
      { key: 'mid', label: '中轨', defaultColor: BOLL_MID_COLOR },
      { key: 'lower', label: '下轨', defaultColor: BOLL_BAND_COLOR },
    ],
  },
  bbi: {
    title: 'BBI',
    params: [arrayParam('bbiPeriods', 'BBI 周期')],
    lines: () => [{ key: 'bbi', label: 'BBI', defaultColor: BBI_COLOR }],
  },
  rsi: { title: 'RSI', params: [numParam('rsiPeriod', '周期')], lines: defLines('rsi') },
  macd: {
    title: 'MACD',
    params: [numParam('macdFast', '快线'), numParam('macdSlow', '慢线'), numParam('macdSignal', '信号')],
    lines: defLines('macd'),
  },
  kdj: {
    title: 'KDJ',
    params: [numParam('kdjPeriod', '周期'), numParam('kdjKSmooth', 'K 平滑'), numParam('kdjDSmooth', 'D 平滑')],
    lines: defLines('kdj'),
  },
  wr: { title: 'WR', params: [inlineArrayParam('wrPeriods', 'WR 周期')], lines: defLines('wr') },
  cci: { title: 'CCI', params: [numParam('cciPeriod', '周期')], lines: defLines('cci') },
  obv: { title: 'OBV', params: [], lines: defLines('obv') },
  atr: { title: 'ATR', params: [numParam('atrPeriod', '周期')], lines: defLines('atr') },
  dmi: { title: 'DMI', params: [numParam('dmiPeriod', '周期')], lines: defLines('dmi') },
}
