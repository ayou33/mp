import type { DailyKline, KlineBar } from '../types'

/** K 线周期:日/周/月 */
export type KlinePeriod = 'day' | 'week' | 'month'

export const PERIOD_LABEL: Record<KlinePeriod, string> = {
  day: '日线',
  week: '周线',
  month: '月线',
}

/** 腾讯行情接口,经 Vite 同源代理转发(代理去掉 /api 前缀),浏览器无跨域限制 */
const KLINE_API = '/api/appstock/app/fqkline/get'

/** 腾讯接口返回的单根原始 K 线数组:[date, open, close, high, low, volume] */
type RawKline = [string, string, string, string, string, string]

interface TencentKlineResponse {
  code: number
  msg: string
  data?: {
    [code: string]: {
      qfqday?: RawKline[] // 前复权日 K
      day?: RawKline[] // 不复权日 K
      qt?: { [code: string]: string[] } // 实时报价(含股票名)
    }
  }
}

/**
 * 把用户输入规范化为腾讯 API 使用的代码格式(小写 sh/sz/bj 前缀 + 6 位数字)。
 * 例:600519 -> sh600519;sh600519 -> sh600519;000001 -> sz000001;300750 -> sz300750
 */
export function normalizeCode(input: string): string {
  const s = input.trim().toLowerCase()
  if (/^(sh|sz|bj)\d{6}$/.test(s)) return s

  const m = s.match(/^(\d{6})$/)
  if (!m) throw new Error(`无法识别股票代码:${input}`)

  const code = m[1]
  if (/^[568]/.test(code)) return `sh${code}` // 60x 沪主板、68x 科创板、5x 沪市基金
  if (/^[03]/.test(code)) return `sz${code}` // 00x 深主板、30x 创业板
  if (/^[49]/.test(code)) return `bj${code}` // 北交所
  throw new Error(`无法识别股票代码:${input}`)
}

/** 请求并解析指定代码、周期的 K 线(前复权优先) */
async function fetchRawKline(
  code: string,
  period: KlinePeriod,
  start: string,
  end: string,
  count: number,
): Promise<{ name: string; bars: KlineBar[] }> {
  const url = `${KLINE_API}?param=${code},${period},${start},${end},${count},qfq`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`行情接口请求失败:HTTP ${resp.status}`)

  const json = (await resp.json()) as TencentKlineResponse
  const stock = json.data?.[code]
  if (!stock) throw new Error(`未找到股票:${code}`)

  // 优先取前复权(qfqday),否则不复权(day),再退化为任意数组字段
  const raw =
    stock.qfqday ??
    stock.day ??
    (() => {
      for (const v of Object.values(stock)) {
        if (Array.isArray(v)) return v as RawKline[]
      }
      return undefined
    })()

  if (!raw || raw.length === 0) throw new Error(`暂无 K 线数据:${code}`)

  const bars: KlineBar[] = raw.map((item) => ({
    time: item[0],
    open: Number(item[1]),
    close: Number(item[2]),
    high: Number(item[3]),
    low: Number(item[4]),
    volume: Number(item[5]),
  }))

  // 股票名称存在 data.<code>.qt.<code>[1],如 贵州茅台
  return { name: stock.qt?.[code]?.[1] ?? code, bars }
}

/**
 * 拉取某只 A 股指定周期的最近 n 根 K 线(前复权)。
 * @param code 规范化的代码,如 sh600519
 * @throws 网络失败 / 未找到股票 / 无 K 线数据时抛错
 */
export async function fetchKline(code: string, period: KlinePeriod, count = 320): Promise<DailyKline> {
  const { name, bars } = await fetchRawKline(code, period, '', '', count)
  return { code, name, bars }
}

/** 兼容旧调用:日 K */
export function fetchDailyKline(code: string, count = 320): Promise<DailyKline> {
  return fetchKline(code, 'day', count)
}

/**
 * 拉取某只 A 股在 beforeDate 之前的更早 K 线(右滑追加历史用)。
 * @param beforeDate 该日期之前的数据(不含当天)
 */
export async function fetchOlderKline(
  code: string,
  period: KlinePeriod,
  beforeDate: string,
  count = 320,
): Promise<KlineBar[]> {
  const { bars } = await fetchRawKline(code, period, '', beforeDate, count)
  return bars
}
