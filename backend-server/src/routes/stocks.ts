import type { FastifyInstance } from 'fastify'
import { normalizeCode, type KlinePeriod, type KlineResponse } from '@mp/shared'
import type { Ctx } from '../app'
import { config } from '../config'
import { badRequest } from '../errors'

export function registerStockRoutes(app: FastifyInstance, ctx: Ctx): void {
  /** GET /api/v1/stocks/search?q=&limit= */
  app.get('/search', async (req) => {
    const { q, limit } = req.query as { q?: string; limit?: string }
    if (!q || !q.trim()) throw badRequest('缺少搜索词 q')
    const l = Math.max(1, Math.min(50, Number(limit) || 10))
    return ctx.tencent.search(q, l)
  })

  /** GET /api/v1/stocks/{code} */
  app.get('/:code', async (req) => {
    const { code } = req.params as { code: string }
    return ctx.tencent.getStock(code)
  })

  /** GET /api/v1/stocks/{code}/kline?period=&fq=&limit=&before= */
  app.get('/:code/kline', async (req) => {
    const { code } = req.params as { code: string }
    const q = req.query as { period?: string; fq?: string; limit?: string; before?: string }
    const period: KlinePeriod = q.period === 'week' || q.period === 'month' ? q.period : 'day'
    const limit = Math.max(1, Math.min(config.klineMaxLimit, Number(q.limit) || 320))
    const k = await ctx.tencent.getKline(code, period, limit, q.before?.trim() || undefined)
    const resp: KlineResponse = {
      code: k.code,
      name: k.name,
      period,
      fq: q.fq === 'none' ? 'none' : 'qfq',
      bars: k.bars,
      nextBefore: k.bars.length > 0 ? k.bars[0].time : null,
    }
    return resp
  })

  /** POST /api/v1/stocks/kline/batch */
  app.post('/kline/batch', async (req) => {
    const body = req.body as { items?: Array<{ code: string; period?: string; fq?: string; limit?: number }> } | null
    if (!body || !Array.isArray(body.items) || body.items.length === 0 || body.items.length > 20) {
      throw badRequest('items 需为 1-20 条')
    }
    const out: Record<string, KlineResponse | null> = {}
    for (const item of body.items) {
      try {
        const period: KlinePeriod = item.period === 'week' || item.period === 'month' ? item.period : 'day'
        const limit = Math.max(1, Math.min(320, item.limit ?? 10))
        const k = await ctx.tencent.getKline(item.code, period, limit)
        out[k.code] = {
          code: k.code,
          name: k.name,
          period,
          fq: item.fq === 'none' ? 'none' : 'qfq',
          bars: k.bars,
          nextBefore: k.bars.length > 0 ? k.bars[0].time : null,
        }
      } catch {
        try {
          out[normalizeCode(item.code)] = null
        } catch {
          /* 无法规范化,跳过 */
        }
      }
    }
    return out
  })
}
