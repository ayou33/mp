/** 股票/指数名称索引 + 代码规范化(服务端与前端共用) */

export interface NamedStock {
  code: string
  name: string
}

/** 指数清单(默认自选:上证指数 / 科创综指 / 创业板指) */
export const INDEX_STOCKS: NamedStock[] = [
  { code: 'sh000001', name: '上证指数' },
  { code: 'sh000680', name: '科创综指' },
  { code: 'sz399006', name: '创业板指' },
]

/** 常用 A 股清单(搜索名称匹配的数据源之一) */
export const POPULAR_STOCKS: NamedStock[] = [
  { code: 'sh600519', name: '贵州茅台' },
  { code: 'sz000001', name: '平安银行' },
  { code: 'sz300750', name: '宁德时代' },
  { code: 'sh600036', name: '招商银行' },
  { code: 'sh601318', name: '中国平安' },
  { code: 'sz000858', name: '五粮液' },
  { code: 'sh600900', name: '长江电力' },
  { code: 'sz002594', name: '比亚迪' },
]

/** 默认自选代码(首次初始化种子) */
export const DEFAULT_WATCHLIST_CODES = ['sh000001', 'sh000680', 'sz399006']

const NAME_MAP = new Map([...INDEX_STOCKS, ...POPULAR_STOCKS].map((s) => [s.code, s.name]))

/** 取股票显示名,未知代码回退为代码本身 */
export function stockName(code: string): string {
  return NAME_MAP.get(code) ?? code
}

/**
 * 把用户输入规范化为 sh/sz/bj + 6 位的小写代码。
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
