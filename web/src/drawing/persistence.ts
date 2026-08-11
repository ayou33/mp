import type { SerializedDrawing } from './types'

const DRAWINGS_PREFIX = 'mp_drawings'

/** 按股票代码 + 周期生成存储 key(与 mp_settings/mp_watchlist 同模式的 localStorage 持久化) */
export function drawingStorageKey(code: string, period: string): string {
  return `${DRAWINGS_PREFIX}:${code}:${period}`
}

/** 读取指定 key 的画线数据;损坏/缺失返回空数组 */
export function loadDrawings(key: string): SerializedDrawing[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SerializedDrawing[]) : []
  } catch {
    return []
  }
}

/** 保存画线数据;空数组等价于清除该 key */
export function saveDrawings(key: string, items: SerializedDrawing[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(items))
  } catch {
    /* 忽略存储失败(隐私模式/配额) */
  }
}
