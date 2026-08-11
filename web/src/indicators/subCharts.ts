import type { SubChartIndicatorDef } from './SubChartIndicator'
import { calcKDJ } from './kdj'
import { calcMACD } from './macd'
import { calcRSI } from './rsi'
import { calcWR } from './wr'
import { calcCCI } from './cci'
import { calcOBV } from './obv'
import { calcATR } from './atr'
import { calcDMI } from './dmi'

const RSI_COLOR = '#b685f0'
const MACD_HIST_COLOR = '#f23645'

export const RSI_DEF: SubChartIndicatorDef = {
  id: 'rsi',
  label: 'RSI',
  components: [{ key: 'RSI', color: RSI_COLOR, type: 'line' }],
  calc: (bars, p) => [{ key: 'RSI', points: calcRSI(bars, p.rsiPeriod ?? 14) }],
}

export const MACD_DEF: SubChartIndicatorDef = {
  id: 'macd',
  label: 'MACD',
  components: [
    { key: 'DIF', color: '#f0b90b', type: 'line' },
    { key: 'DEA', color: '#2962ff', type: 'line' },
    { key: 'MACD', color: MACD_HIST_COLOR, type: 'histogram' },
  ],
  calc: (bars, p) => {
    const r = calcMACD(bars, p.macdFast ?? 12, p.macdSlow ?? 26, p.macdSignal ?? 9)
    return [
      { key: 'DIF', points: r.dif },
      { key: 'DEA', points: r.dea },
      { key: 'MACD', points: r.macd },
    ]
  },
}

export const KDJ_DEF: SubChartIndicatorDef = {
  id: 'kdj',
  label: 'KDJ',
  components: [
    { key: 'K', color: '#f0b90b', type: 'line' },
    { key: 'D', color: '#2962ff', type: 'line' },
    { key: 'J', color: '#b685f0', type: 'line' },
  ],
  calc: (bars, p) => {
    const r = calcKDJ(bars, p.kdjPeriod ?? 9, p.kdjKSmooth ?? 3, p.kdjDSmooth ?? 3)
    return [
      { key: 'K', points: r.k },
      { key: 'D', points: r.d },
      { key: 'J', points: r.j },
    ]
  },
}

export const WR_DEF: SubChartIndicatorDef = {
  id: 'wr',
  label: 'WR',
  components: [
    { key: 'WR6', color: '#26c6da', type: 'line' },
    { key: 'WR14', color: '#b685f0', type: 'line' },
  ],
  calc: (bars, p) => [
    { key: 'WR6', points: calcWR(bars, p.wrPeriods?.[0] ?? 6) },
    { key: 'WR14', points: calcWR(bars, p.wrPeriods?.[1] ?? 14) },
  ],
}

export const CCI_DEF: SubChartIndicatorDef = {
  id: 'cci',
  label: 'CCI',
  components: [{ key: 'CCI', color: '#f0b90b', type: 'line' }],
  calc: (bars, p) => [{ key: 'CCI', points: calcCCI(bars, p.cciPeriod ?? 14) }],
}

export const OBV_DEF: SubChartIndicatorDef = {
  id: 'obv',
  label: 'OBV',
  components: [{ key: 'OBV', color: '#4fc3f7', type: 'line' }],
  calc: (bars) => [{ key: 'OBV', points: calcOBV(bars) }],
}

export const ATR_DEF: SubChartIndicatorDef = {
  id: 'atr',
  label: 'ATR',
  components: [{ key: 'ATR', color: '#ffb74d', type: 'line' }],
  calc: (bars, p) => [{ key: 'ATR', points: calcATR(bars, p.atrPeriod ?? 14) }],
}

export const DMI_DEF: SubChartIndicatorDef = {
  id: 'dmi',
  label: 'DMI',
  components: [
    { key: 'PDI', color: '#f23645', type: 'line' },
    { key: 'MDI', color: '#089981', type: 'line' },
    { key: 'ADX', color: '#f0b90b', type: 'line' },
    { key: 'ADXR', color: '#b685f0', type: 'line' },
  ],
  calc: (bars, p) => {
    const r = calcDMI(bars, p.dmiPeriod ?? 14)
    return [
      { key: 'PDI', points: r.pdi },
      { key: 'MDI', points: r.mdi },
      { key: 'ADX', points: r.adx },
      { key: 'ADXR', points: r.adxr },
    ]
  },
}
