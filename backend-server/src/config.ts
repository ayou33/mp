import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

export const config = {
  /** HTTP 端口(env PORT 覆盖) */
  port: Number(process.env.PORT ?? 3000),
  /** SQLite 数据库路径(env DB_PATH 覆盖;默认 backend-server/data/mp.db) */
  dbPath: process.env.DB_PATH ?? join(here, '..', 'data', 'mp.db'),
  /** 腾讯行情接口(web.ifzq.gtimg.cn 直连,服务端无 CORS 限制) */
  tencentBase: 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get',
  /** K 线内存缓存 TTL(ms) */
  klineTtlMs: 60_000,
  /** 简单限流:相邻腾讯请求最小间隔(ms) */
  minRequestGapMs: 200,
  /** 单次 K 线请求条数上限 */
  klineMaxLimit: 2000,
}
