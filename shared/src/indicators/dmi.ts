import type { IndicatorPoint, KlineBar } from '../types'

/** DMI 趋向指标结果:PDI(多方)/MDI(空方)/ADX(趋势强度)/ADXR(ADX 均值) */
export interface DmiResult {
  pdi: IndicatorPoint[]
  mdi: IndicatorPoint[]
  adx: IndicatorPoint[]
  adxr: IndicatorPoint[]
}

/**
 * 趋向指标(DMI/ADX),Wilder 平滑。
 * PDI = 100×(+DM 平滑和)/TR 平滑和,MDI 同理;DX = 100×|PDI-MDI|/(PDI+MDI);
 * ADX 为 DX 的 Wilder 平滑,ADXR = (今日 ADX + period 天前 ADX)/2。
 */
export function calcDMI(bars: KlineBar[], period = 14): DmiResult {
  const pdi: IndicatorPoint[] = []
  const mdi: IndicatorPoint[] = []
  const adx: IndicatorPoint[] = []
  const adxr: IndicatorPoint[] = []
  const n = bars.length
  if (period <= 0 || n <= period) return { pdi, mdi, adx, adxr }

  // TR / +DM / -DM(下标 0 无意义,自 1 起)
  const tr = new Array<number>(n).fill(0)
  const pdm = new Array<number>(n).fill(0)
  const mdm = new Array<number>(n).fill(0)
  for (let i = 1; i < n; i++) {
    const up = bars[i].high - bars[i - 1].high
    const down = bars[i - 1].low - bars[i].low
    pdm[i] = up > down && up > 0 ? up : 0
    mdm[i] = down > up && down > 0 ? down : 0
    tr[i] = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    )
  }

  let trSum = 0
  let pdmSum = 0
  let mdmSum = 0
  for (let i = 1; i <= period; i++) {
    trSum += tr[i]
    pdmSum += pdm[i]
    mdmSum += mdm[i]
  }

  // PDI/MDI + DX 序列(自 period+1 起,Wilder 平滑)
  const dxs: Array<{ time: string; value: number }> = []
  for (let i = period + 1; i < n; i++) {
    trSum += (tr[i] - trSum) / period
    pdmSum += (pdm[i] - pdmSum) / period
    mdmSum += (mdm[i] - mdmSum) / period
    const pdiVal = trSum === 0 ? 0 : (100 * pdmSum) / trSum
    const mdiVal = trSum === 0 ? 0 : (100 * mdmSum) / trSum
    pdi.push({ time: bars[i].time, value: pdiVal })
    mdi.push({ time: bars[i].time, value: mdiVal })
    const sum = pdiVal + mdiVal
    dxs.push({ time: bars[i].time, value: sum === 0 ? 0 : (100 * Math.abs(pdiVal - mdiVal)) / sum })
  }

  // ADX:DX 的 Wilder 平滑(自第 period 个 DX 起);ADXR 再取 period 天平滑
  if (dxs.length >= period) {
    let adxVal = 0
    for (let i = 0; i < period; i++) adxVal += dxs[i].value
    adxVal /= period
    adx.push({ time: dxs[period - 1].time, value: adxVal })
    for (let i = period; i < dxs.length; i++) {
      adxVal = (adxVal * (period - 1) + dxs[i].value) / period
      adx.push({ time: dxs[i].time, value: adxVal })
    }
    for (let i = period; i < adx.length; i++) {
      adxr.push({ time: adx[i].time, value: (adx[i].value + adx[i - period].value) / 2 })
    }
  }
  return { pdi, mdi, adx, adxr }
}
