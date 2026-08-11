/** 常用 A 股清单(名称映射数据源) */
export const POPULAR_STOCKS: Array<{ code: string; name: string }> = [
  { code: 'sh600519', name: '贵州茅台' },
  { code: 'sz000001', name: '平安银行' },
  { code: 'sz300750', name: '宁德时代' },
  { code: 'sh600036', name: '招商银行' },
  { code: 'sh601318', name: '中国平安' },
  { code: 'sz000858', name: '五粮液' },
  { code: 'sh600900', name: '长江电力' },
  { code: 'sz002594', name: '比亚迪' },
]

/** 指数清单(默认自选:上证指数 / 科创综指 / 创业板指) */
export const INDEX_STOCKS: Array<{ code: string; name: string }> = [
  { code: 'sh000001', name: '上证指数' },
  { code: 'sh000680', name: '科创综指' },
  { code: 'sz399006', name: '创业板指' },
]

/** 浏览记录条目(最近浏览;名称来自行情接口,未知代码回退名称映射) */
export interface BrowseEntry {
  code: string
  name: string
}

const NAME_MAP = new Map([...INDEX_STOCKS, ...POPULAR_STOCKS].map((s) => [s.code, s.name]))

/** 取股票显示名,未知代码回退为代码本身 */
export function stockName(code: string): string {
  return NAME_MAP.get(code) ?? code
}
