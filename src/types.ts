/** 单根日 K 线(含成交量,成交量只用于副图,不传给蜡烛图 series) */
export interface KlineBar {
  time: string // 'YYYY-MM-DD'
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** 指标序列数据点,直接兼容 lightweight-charts 的 LineData */
export interface IndicatorPoint {
  time: string
  value: number
}

/** 拉取到的日 K 数据集合 */
export interface DailyKline {
  /** 规范化后的代码,如 sh600519 */
  code: string
  /** 股票名称,如 贵州茅台 */
  name: string
  bars: KlineBar[]
}
