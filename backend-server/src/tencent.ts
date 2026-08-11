import { INDEX_STOCKS, POPULAR_STOCKS, normalizeCode, stockName, type KlineBar, type KlinePeriod, type Stock } from '@mp/shared'
import { config } from './config'
import { notFound, upstream } from './errors'

/** 腾讯原始 K 线行:[date, open, close, high, low, volume] */
type RawKline = [string, string, string, string, string, string]

interface TencentKlineResponse {
  code: number
  msg: string
  data?: {
    [code: string]: {
      qfqday?: RawKline[]
      day?: RawKline[]
      qt?: { [code: string]: string[] }
    }
  }
}

export interface TencentKline {
  code: string
  name: string
  bars: KlineBar[]
}

/** 腾讯响应 → 名称/行情(前复权优先) */
function parseTencent(code: string, json: TencentKlineResponse): TencentKline {
  const stock = json.data?.[code]
  if (!stock) throw notFound(`未找到股票:${code}`)
  const raw = stock.qfqday ?? stock.day
  if (!raw || raw.length === 0) throw notFound(`暂无 K 线数据:${code}`)
  const bars: KlineBar[] = raw.map((item) => ({
    time: item[0],
    open: Number(item[1]),
    close: Number(item[2]),
    high: Number(item[3]),
    low: Number(item[4]),
    volume: Number(item[5]),
  }))
  const name = stock.qt?.[code]?.[1] ?? stockName(code)
  return { code, name, bars }
}

export interface TencentClientOptions {
  /** K 线缓存 TTL(ms),缺省用全局 config */
  klineTtlMs?: number
  /** 相邻请求最小间隔(ms),缺省用全局 config */
  minRequestGapMs?: number
}

/**
 * 行情客户端:直连腾讯接口 + 内存 TTL 缓存 + 简单限流 + 名称缓存(搜索用)。
 */
export function createTencentClient(opts: TencentClientOptions = {}) {
  const klineTtlMs = opts.klineTtlMs ?? config.klineTtlMs
  const minRequestGapMs = opts.minRequestGapMs ?? config.minRequestGapMs
  /** K 线缓存 key:code:period:before:count */
  const klineCache = new Map<string, { at: number; value: TencentKline }>()
  /** 已见过的 code → name(搜索名称匹配 + 未知代码名称解析) */
  const nameCache = new Map<string, string>()
  let lastRequestAt = 0

  async function fetchWithLimit(url: string): Promise<Response> {
    const now = Date.now()
    const wait = minRequestGapMs - (now - lastRequestAt)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastRequestAt = Date.now()
    const resp = await fetch(url)
    if (!resp.ok) throw upstream(`行情接口请求失败:HTTP ${resp.status}`)
    return resp
  }

  async function rawKline(code: string, period: KlinePeriod, count: number, before?: string): Promise<TencentKline> {
    const key = `${code}:${period}:${before ?? ''}:${count}`
    const hit = klineCache.get(key)
    if (hit && Date.now() - hit.at < klineTtlMs) return hit.value
    const url = `${config.tencentBase}?param=${code},${period},,${before ?? ''},${count},qfq`
    const resp = await fetchWithLimit(url)
    let json: TencentKlineResponse
    try {
      json = (await resp.json()) as TencentKlineResponse
    } catch {
      throw upstream('行情接口响应解析失败')
    }
    const out = parseTencent(code, json)
    nameCache.set(code, out.name)
    klineCache.set(key, { at: Date.now(), value: out })
    return out
  }

  return {
    /** 拉 K 线(含 before 更早历史) */
    async getKline(code: string, period: KlinePeriod, count: number, before?: string): Promise<TencentKline> {
      return rawKline(normalizeCode(code), period, count, before)
    },

    /** 解析股票元信息:名称优先名称缓存/静态索引,未知则拉一次行情补名 */
    async getStock(input: string): Promise<Stock> {
      const code = normalizeCode(input)
      const market = code.startsWith('sh') ? ('sh' as const) : code.startsWith('sz') ? ('sz' as const) : ('bj' as const)
      const known = nameCache.get(code) ?? stockName(code)
      if (known !== code) {
        return { code, name: known, market, kind: INDEX_STOCKS.some((s) => s.code === code) ? 'index' : 'stock' }
      }
      const k = await rawKline(code, 'day', 1)
      return { code, name: k.name, market, kind: INDEX_STOCKS.some((s) => s.code === code) ? 'index' : 'stock' }
    },

    /** 搜索:6 位/带前缀代码规范化 + 名称关键词匹配(静态索引 + 名称缓存) */
    async search(query: string, limit = 10): Promise<Stock[]> {
      const q = query.trim()
      if (!q) throw new Error('搜索词不能为空')
      const codeInput = /^[a-zA-Z]{2}\d{6}$|^\d{6}$/.test(q)
      if (codeInput) {
        try {
          return [await this.getStock(q)]
        } catch {
          return []
        }
      }
      const seen = new Set<string>()
      const out: Stock[] = []
      const push = (code: string, name: string): void => {
        if (seen.has(code) || out.length >= limit) return
        seen.add(code)
        const market = code.startsWith('sh') ? ('sh' as const) : code.startsWith('sz') ? ('sz' as const) : ('bj' as const)
        out.push({ code, name, market, kind: INDEX_STOCKS.some((s) => s.code === code) ? 'index' : 'stock' })
      }
      for (const s of [...INDEX_STOCKS, ...POPULAR_STOCKS]) if (s.name.includes(q)) push(s.code, s.name)
      for (const [code, name] of nameCache) if (name.includes(q)) push(code, name)
      return out.slice(0, limit)
    },
  }
}

export type TencentClient = ReturnType<typeof createTencentClient>
