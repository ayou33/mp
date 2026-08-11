import type { FastifyInstance } from 'fastify'
import { normalizeCode, type Drawing, type DrawingSource, type KlinePeriod } from '@mp/shared'
import type { Ctx } from '../app'
import { addWatchlist, deleteDrawings, getDrawings, listWatchlist, removeWatchlist } from '../db'
import { notFound } from '../errors'

export function registerWatchlistRoutes(app: FastifyInstance, ctx: Ctx): void {
  /** GET /api/v1/watchlist */
  app.get('/', async () => listWatchlist(ctx.db))

  /** GET /api/v1/watchlist/drawings?source=&period= (自选股画线,缺省系统类型) */
  app.get('/drawings', async (req) => {
    const q = req.query as { source?: string; period?: string }
    const src: DrawingSource = q.source === 'user' ? 'user' : 'system'
    const periods: KlinePeriod[] = q.period === 'week' || q.period === 'month' ? [q.period] : ['day', 'week', 'month']
    const out: Record<string, Record<string, Drawing[]>> = {}
    for (const it of listWatchlist(ctx.db)) {
      const byPeriod: Record<string, Drawing[]> = {}
      for (const p of periods) byPeriod[p] = getDrawings(ctx.db, it.code, p).filter((d) => d.source === src)
      out[it.code] = byPeriod
    }
    return out
  })

  /** DELETE /api/v1/watchlist/drawings?source=&period= */
  app.delete('/drawings', async (req, reply) => {
    const q = req.query as { source?: string; period?: string }
    const src: DrawingSource = q.source === 'user' ? 'user' : 'system'
    const period: KlinePeriod | undefined = q.period === 'week' || q.period === 'month' ? q.period : undefined
    for (const it of listWatchlist(ctx.db)) deleteDrawings(ctx.db, it.code, period, src)
    return reply.code(204).send()
  })

  /** PUT /api/v1/watchlist/{code} */
  app.put('/:code', async (req) => {
    const { code } = req.params as { code: string }
    const stock = await ctx.tencent.getStock(code)
    return addWatchlist(ctx.db, stock.code, stock.name)
  })

  /** DELETE /api/v1/watchlist/{code} (级联删除该股全部画线) */
  app.delete('/:code', async (req, reply) => {
    const { code } = req.params as { code: string }
    const normalized = normalizeCode(code)
    const removed = removeWatchlist(ctx.db, normalized)
    if (!removed) throw notFound(`自选中不存在:${normalized}`)
    return reply.code(204).send()
  })
}
