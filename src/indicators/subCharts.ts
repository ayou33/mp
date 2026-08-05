import type { SubChartIndicatorDef } from './SubChartIndicator'
import { calcKDJ } from './kdj'
import { calcMACD } from './macd'
import { calcRSI } from './rsi'

const RSI_COLOR = '#b685f0'
const MACD_HIST_COLOR = '#f23645'

export const RSI_DEF: SubChartIndicatorDef = {
  id: 'rsi',
  label: 'RSI',
  components: [{ key: 'RSI', color: RSI_COLOR, type: 'line' }],
  calc: (bars) => [{ key: 'RSI', points: calcRSI(bars, 14) }],
}

export const MACD_DEF: SubChartIndicatorDef = {
  id: 'macd',
  label: 'MACD',
  components: [
    { key: 'DIF', color: '#f0b90b', type: 'line' },
    { key: 'DEA', color: '#2962ff', type: 'line' },
    { key: 'MACD', color: MACD_HIST_COLOR, type: 'histogram' },
  ],
  calc: (bars) => {
    const r = calcMACD(bars)
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
  calc: (bars) => {
    const r = calcKDJ(bars)
    return [
      { key: 'K', points: r.k },
      { key: 'D', points: r.d },
      { key: 'J', points: r.j },
    ]
  },
}
