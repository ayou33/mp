import type { FastifyInstance } from 'fastify'
import { DRAWING_TYPE_CATALOG, type DrawingSource, type DrawingsPayload, type KlinePeriod } from '@mp/shared'
import type { Ctx } from '../app'
import { deleteDrawingById, deleteDrawings, getDrawings, saveDrawings } from '../db'
import { badRequest } from '../errors'

export function registerDrawingRoutes(app: FastifyInstance, ctx: Ctx): void {
  /** GET /api/v1/drawings/types */
  app.get('/types', async () => DRAWING_TYPE_CATALOG)

  /** GET /api/v1/drawings?stock=&period=&source= */
  app.get('/', async (req) => {
    const q = req.query as { stock?: string; period?: string; source?: string }
    if (!q.stock) throw badRequest('缺少 stock')
    const period: KlinePeriod = q.period === 'week' || q.period === 'month' ? q.period : 'day'
    const rows = getDrawings(ctx.db, q.stock, period)
    if (q.source === 'user' || q.source === 'system') return rows.filter((d) => d.source === q.source)
    return rows
  })

  /** PUT /api/v1/drawings (全量保存) */
  app.put('/', async (req) => {
    const body = req.body as DrawingsPayload | null
    if (!body?.stock || !body.period || !Array.isArray(body.items)) throw badRequest('需提供 stock/period/items')
    const period: KlinePeriod = body.period === 'week' || body.period === 'month' ? body.period : 'day'
    return saveDrawings(ctx.db, body.stock, period, body.items)
  })

  /** DELETE /api/v1/drawings?stock=&period=&source= (条件批量) */
  app.delete('/', async (req, reply) => {
    const q = req.query as { stock?: string; period?: string; source?: string }
    if (!q.stock) throw badRequest('缺少 stock')
    const period: KlinePeriod | undefined = q.period === 'week' || q.period === 'month' ? q.period : undefined
    const source: DrawingSource | undefined = q.source === 'user' || q.source === 'system' ? q.source : undefined
    deleteDrawings(ctx.db, q.stock, period, source)
    return reply.code(204).send()
  })

  /** DELETE /api/v1/drawings/{id}?stock=&period= */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const q = req.query as { stock?: string; period?: string }
    if (!q.stock) throw badRequest('缺少 stock')
    const period: KlinePeriod = q.period === 'week' || q.period === 'month' ? q.period : 'day'
    const num = Number(id)
    if (!Number.isFinite(num)) throw badRequest('id 必须为数字')
    deleteDrawingById(ctx.db, q.stock, period, num)
    return reply.code(204).send()
  })
}
