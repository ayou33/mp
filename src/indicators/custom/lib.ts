/**
 * 值级纯函数库:输入/输出均为 `(number | null)[]`,null 表示该位置无有效值(预热未完成)。
 * 所有窗口类函数输出与输入等长,预热期位置为 null。
 * 供自定义指标 calc 中自由组合;与 bars 级常用指标(calcMA/calcMACD 等,见 src/indicators/index.ts)互补。
 */

/** 值级序列:null = 无效值(跳过该点) */
export type NumArr = Array<number | null>

/** 简单移动平均(SMA)。窗口含 null 时输出 null。 */
export function sma(values: NumArr, period: number): NumArr {
  const n = values.length
  const out: NumArr = new Array(n).fill(null)
  if (period <= 0) return out
  let sum = 0
  let nulls = 0
  for (let i = 0; i < n; i++) {
    const v = values[i]
    sum += v ?? 0
    if (v === null) nulls++
    if (i >= period) {
      const old = values[i - period]
      sum -= old ?? 0
      if (old === null) nulls--
    }
    if (i >= period - 1 && nulls === 0) out[i] = sum / period
  }
  return out
}

/** 指数移动平均(EMA),k = 2/(period+1),首值取第一有效值。 */
export function ema(values: NumArr, period: number): NumArr {
  const n = values.length
  const out: NumArr = new Array(n).fill(null)
  if (period <= 0) return out
  const k = 2 / (period + 1)
  let prev: number | null = null
  for (let i = 0; i < n; i++) {
    const v = values[i]
    if (v === null) {
      prev = null
      continue
    }
    prev = prev === null ? v : v * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/** 总体标准差(与 calcBOLL 一致):窗口均值 ± 窗口内样本平方差均值开方。 */
export function stddev(values: NumArr, period: number): NumArr {
  const n = values.length
  const out: NumArr = new Array(n).fill(null)
  if (period <= 0) return out
  let sum = 0
  let nulls = 0
  for (let i = 0; i < n; i++) {
    const v = values[i]
    sum += v ?? 0
    if (v === null) nulls++
    if (i >= period) {
      const old = values[i - period]
      sum -= old ?? 0
      if (old === null) nulls--
    }
    if (i >= period - 1 && nulls === 0) {
      const mean = sum / period
      let vsum = 0
      for (let j = i - period + 1; j <= i; j++) {
        const d = (values[j] as number) - mean
        vsum += d * d
      }
      out[i] = Math.sqrt(vsum / period)
    }
  }
  return out
}

/** 滚动窗口求和。窗口含 null 时输出 null。 */
export function sum(values: NumArr, period: number): NumArr {
  const n = values.length
  const out: NumArr = new Array(n).fill(null)
  if (period <= 0) return out
  let s = 0
  let nulls = 0
  for (let i = 0; i < n; i++) {
    const v = values[i]
    s += v ?? 0
    if (v === null) nulls++
    if (i >= period) {
      const old = values[i - period]
      s -= old ?? 0
      if (old === null) nulls--
    }
    if (i >= period - 1 && nulls === 0) out[i] = s
  }
  return out
}

/** 区间最高值(HHV):前 period 根(含当前)最大值。 */
export function hhv(values: NumArr, period: number): NumArr {
  const n = values.length
  const out: NumArr = new Array(n).fill(null)
  if (period <= 0) return out
  for (let i = period - 1; i < n; i++) {
    let best = -Infinity
    let ok = true
    for (let j = i - period + 1; j <= i; j++) {
      if (values[j] === null) {
        ok = false
        break
      }
      if ((values[j] as number) > best) best = values[j] as number
    }
    if (ok) out[i] = best
  }
  return out
}

/** 区间最低值(LLV):前 period 根(含当前)最小值。 */
export function llv(values: NumArr, period: number): NumArr {
  const n = values.length
  const out: NumArr = new Array(n).fill(null)
  if (period <= 0) return out
  for (let i = period - 1; i < n; i++) {
    let best = Infinity
    let ok = true
    for (let j = i - period + 1; j <= i; j++) {
      if (values[j] === null) {
        ok = false
        break
      }
      if ((values[j] as number) < best) best = values[j] as number
    }
    if (ok) out[i] = best
  }
  return out
}

/** Wilder 平滑(RSI/ATR 用):前 period 根 SMA 起步,之后 prev + (v - prev)/period。 */
export function wilder(values: NumArr, period: number): NumArr {
  const n = values.length
  const out: NumArr = new Array(n).fill(null)
  if (period <= 0) return out
  const smaArr = sma(values, period)
  let prev: number | null = null
  for (let i = 0; i < n; i++) {
    const v = values[i]
    if (v === null) {
      prev = null
      continue
    }
    if (smaArr[i] !== null && prev === null) {
      prev = smaArr[i]
    } else if (prev !== null) {
      prev = prev + (v - prev) / period
    }
    if (i >= period - 1 && smaArr[i] !== null) out[i] = prev
  }
  return out
}

/** 前移 n 根:out[i] = values[i - n];前 n 根为 null。 */
export function ref(values: NumArr, n: number): NumArr {
  const out: NumArr = new Array(values.length).fill(null)
  for (let i = n; i < values.length; i++) out[i] = values[i - n]
  return out
}

/** 未来引用(REFX):当前值为 n 根后的值;末尾 n 根为 null。n=0 原样返回。 */
export function refx(values: NumArr, n: number): NumArr {
  if (n <= 0) return [...values]
  const out: NumArr = new Array(values.length).fill(null)
  for (let i = 0; i + n < values.length; i++) out[i] = values[i + n]
  return out
}

/** 有效值计数(BARSCOUNT):到当前位为止的有效值个数(从第一个有效值起 1 计数)。 */
export function barsCount(values: NumArr): NumArr {
  const out: NumArr = new Array(values.length).fill(null)
  let count = 0
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null) count++
    out[i] = count
  }
  return out
}

/** 逐元素取绝对值。 */
export function abs(values: NumArr): NumArr {
  return values.map((v) => (v === null ? null : Math.abs(v)))
}

/** 取数组某下标值;标量恒返回自身。 */
function at(a: NumArr | number, i: number): number | null {
  return typeof a === 'number' ? a : a[i]
}

/** 参与逐元素运算的最大长度(两个数组取较长者,标量不贡献长度)。 */
function lenOf(a: NumArr | number, b: NumArr | number): number {
  const al = typeof a === 'number' ? 0 : a.length
  const bl = typeof b === 'number' ? 0 : b.length
  return Math.max(al, bl)
}

/** 逐元素取最大值;b 可为标量(与 a 每项比较)。 */
export function max(a: NumArr | number, b: NumArr | number): NumArr {
  const n = lenOf(a, b)
  const out: NumArr = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    const va = at(a, i)
    const vb = at(b, i)
    if (va === null || vb === null) continue
    out[i] = Math.max(va, vb)
  }
  return out
}

/** 逐元素取最小值;b 可为标量。 */
export function min(a: NumArr | number, b: NumArr | number): NumArr {
  const n = lenOf(a, b)
  const out: NumArr = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    const va = at(a, i)
    const vb = at(b, i)
    if (va === null || vb === null) continue
    out[i] = Math.min(va, vb)
  }
  return out
}

/**
 * 上穿:crossOver(a, b) — a 从 ≤ b 变为 > b 的位置为 1,其余为 0。
 * 与 b 的比较亦可用标量。前一根或当前有 null 时输出 null(无法判定)。
 */
export function crossOver(a: NumArr | number, b: NumArr | number): NumArr {
  const n = lenOf(a, b)
  const out: NumArr = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    const va = at(a, i)
    const va0 = at(a, i - 1)
    const vb = at(b, i)
    const vb0 = at(b, i - 1)
    if (i === 0 || va === null || vb === null || va0 === null || vb0 === null) continue
    out[i] = va > vb && va0 <= vb0 ? 1 : 0
  }
  return out
}

/** 下穿:crossUnder(a, b) — a 从 ≥ b 变为 < b 的位置为 1,其余为 0。 */
export function crossUnder(a: NumArr | number, b: NumArr | number): NumArr {
  const n = lenOf(a, b)
  const out: NumArr = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    const va = at(a, i)
    const va0 = at(a, i - 1)
    const vb = at(b, i)
    const vb0 = at(b, i - 1)
    if (i === 0 || va === null || vb === null || va0 === null || vb0 === null) continue
    out[i] = va < vb && va0 >= vb0 ? 1 : 0
  }
  return out
}

/** 十六进制颜色 → rgba 字符串(hex 支持 #rgb/#rrggbb)。 */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  if (full.length === 8) {
    // #rrggbbaa:自带透明度,与传入 alpha 按比例叠加
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
