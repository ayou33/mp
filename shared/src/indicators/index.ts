/**
 * 内置指标注册表:web 侧 subCharts.ts / editorMeta.ts 的服务端对应物。
 * id + 参数 key 与 web 对齐(maPeriods/emaPeriods/rsiPeriod/...),供 /indicators/calc 使用。
 */
import type { IndicatorOutput, IndicatorPoint, KlineBar } from '../types'
import { calcMA } from './ma'
import { calcEMA } from './ema'
import { calcBBI, BBI_PERIODS } from './bbi'
import { calcBOLL } from './boll'
import { calcRSI } from './rsi'
import { calcMACD } from './macd'
import { calcKDJ } from './kdj'
import { calcWR } from './wr'
import { calcCCI } from './cci'
import { calcOBV } from './obv'
import { calcATR } from './atr'
import { calcDMI } from './dmi'

export interface BuiltinParamSpec {
  key: string
  label: string
  kind: 'number' | 'array'
  default?: number
  defaults?: number[]
}

export interface BuiltinIndicatorDef {
  id: string
  label: string
  params: BuiltinParamSpec[]
  calc: (bars: KlineBar[], params: Record<string, number | number[] | string>) => IndicatorOutput[]
}

const num = (key: string, label: string, def: number): BuiltinParamSpec => ({ key, label, kind: 'number', default: def })
const arr = (key: string, label: string, defaults: number[]): BuiltinParamSpec => ({ key, label, kind: 'array', defaults })

const numOf = (p: Record<string, number | number[] | string>, key: string, def: number): number =>
  typeof p[key] === 'number' && Number.isFinite(p[key] as number) ? (p[key] as number) : def
const arrOf = (p: Record<string, number | number[] | string>, key: string, defs: number[]): number[] =>
  Array.isArray(p[key]) ? (p[key] as number[]).filter((n) => typeof n === 'number' && Number.isFinite(n)) : defs

const line = (key: string, label: string, data: IndicatorPoint[]): IndicatorOutput => ({ key, label, type: 'line', data })

export const BUILTIN_INDICATORS: Record<string, BuiltinIndicatorDef> = {
  ma: {
    id: 'ma',
    label: 'MA',
    params: [arr('maPeriods', '均线周期', [5, 10, 20])],
    calc: (bars, p) => {
      const periods = arrOf(p, 'maPeriods', [5, 10, 20])
      return periods.map((period, i) => line(String(i), `MA${period}`, calcMA(bars, period)))
    },
  },
  ema: {
    id: 'ema',
    label: 'EMA',
    params: [arr('emaPeriods', 'EMA 周期', [5, 10, 20])],
    calc: (bars, p) => {
      const periods = arrOf(p, 'emaPeriods', [5, 10, 20])
      return periods.map((period, i) => line(String(i), `EMA${period}`, calcEMA(bars, period)))
    },
  },
  bbi: {
    id: 'bbi',
    label: 'BBI',
    params: [arr('bbiPeriods', 'BBI 周期', BBI_PERIODS)],
    calc: (bars, p) => [line('bbi', 'BBI', calcBBI(bars, arrOf(p, 'bbiPeriods', BBI_PERIODS)))],
  },
  boll: {
    id: 'boll',
    label: 'BOLL',
    params: [num('bollPeriod', '周期', 20), num('bollStdDev', '标准差', 2)],
    calc: (bars, p) => {
      const r = calcBOLL(bars, numOf(p, 'bollPeriod', 20), numOf(p, 'bollStdDev', 2))
      return [line('upper', '上轨', r.upper), line('mid', '中轨', r.mid), line('lower', '下轨', r.lower)]
    },
  },
  rsi: {
    id: 'rsi',
    label: 'RSI',
    params: [num('rsiPeriod', '周期', 14)],
    calc: (bars, p) => [line('RSI', 'RSI', calcRSI(bars, numOf(p, 'rsiPeriod', 14)))],
  },
  macd: {
    id: 'macd',
    label: 'MACD',
    params: [num('macdFast', '快线', 12), num('macdSlow', '慢线', 26), num('macdSignal', '信号', 9)],
    calc: (bars, p) => {
      const r = calcMACD(bars, numOf(p, 'macdFast', 12), numOf(p, 'macdSlow', 26), numOf(p, 'macdSignal', 9))
      return [
        line('DIF', 'DIF', r.dif),
        line('DEA', 'DEA', r.dea),
        { key: 'MACD', label: 'MACD', type: 'histogram', data: r.macd },
      ]
    },
  },
  kdj: {
    id: 'kdj',
    label: 'KDJ',
    params: [num('kdjPeriod', '周期', 9), num('kdjKSmooth', 'K 平滑', 3), num('kdjDSmooth', 'D 平滑', 3)],
    calc: (bars, p) => {
      const r = calcKDJ(bars, numOf(p, 'kdjPeriod', 9), numOf(p, 'kdjKSmooth', 3), numOf(p, 'kdjDSmooth', 3))
      return [line('K', 'K', r.k), line('D', 'D', r.d), line('J', 'J', r.j)]
    },
  },
  wr: {
    id: 'wr',
    label: 'WR',
    params: [arr('wrPeriods', 'WR 周期', [6, 14])],
    calc: (bars, p) => {
      const periods = arrOf(p, 'wrPeriods', [6, 14])
      return periods.map((period) => line(`WR${period}`, `WR${period}`, calcWR(bars, period)))
    },
  },
  cci: {
    id: 'cci',
    label: 'CCI',
    params: [num('cciPeriod', '周期', 14)],
    calc: (bars, p) => [line('CCI', 'CCI', calcCCI(bars, numOf(p, 'cciPeriod', 14)))],
  },
  obv: {
    id: 'obv',
    label: 'OBV',
    params: [],
    calc: (bars) => [line('OBV', 'OBV', calcOBV(bars))],
  },
  atr: {
    id: 'atr',
    label: 'ATR',
    params: [num('atrPeriod', '周期', 14)],
    calc: (bars, p) => [line('ATR', 'ATR', calcATR(bars, numOf(p, 'atrPeriod', 14)))],
  },
  dmi: {
    id: 'dmi',
    label: 'DMI',
    params: [num('dmiPeriod', '周期', 14)],
    calc: (bars, p) => {
      const r = calcDMI(bars, numOf(p, 'dmiPeriod', 14))
      return [line('PDI', 'PDI', r.pdi), line('MDI', 'MDI', r.mdi), line('ADX', 'ADX', r.adx), line('ADXR', 'ADXR', r.adxr)]
    },
  },
}

/** 计算单个内置指标(参数用 API 的 [{key,value}] 形式) */
export function calcBuiltinIndicator(
  id: string,
  bars: KlineBar[],
  params: Array<{ key: string; value: number | number[] | string }>,
): IndicatorOutput[] {
  const def = BUILTIN_INDICATORS[id]
  if (!def) throw new Error(`未知指标 ${id.toUpperCase()}`)
  const map: Record<string, number | number[] | string> = {}
  for (const p of params) map[p.key] = p.value
  return def.calc(bars, map)
}

// ===== 公开导出:bars 级 calc 纯函数(web/backend 共用) =====
export { calcMA } from './ma'
export { calcEMA } from './ema'
export { BBI_PERIODS, calcBBI } from './bbi'
export { calcBOLL } from './boll'
export { calcRSI } from './rsi'
export { calcMACD, type MacdSeriesData, type MacdBarPoint } from './macd'
export { calcKDJ, type KdjSeriesData } from './kdj'
export { calcWR } from './wr'
export { calcCCI } from './cci'
export { calcOBV } from './obv'
export { calcATR } from './atr'
export { calcDMI, type DmiResult } from './dmi'
