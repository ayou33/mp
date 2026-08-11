import type { FastifyInstance } from 'fastify'
import { normalizeCode } from '@mp/shared'
import type { Ctx } from '../app'
import { listBrowseHistory, recordBrowse } from '../db'
import { badRequest, notFound } from '../errors'

export function registerBrowseHistoryRoutes(app: FastifyInstance, ctx: Ctx): void {
  /** GET /api/v1/browse-history?limit= */
  app.get('/', async (req) => {
    const { limit } = req.query as { limit?: string }
    return listBrowseHistory(ctx.db, Number(limit) || 30)
  })

  /** POST /api/v1/browse-history { code, name? } */
  app.post('/', async (req) => {
    const body = req.body as { code?: string; name?: string } | null
    if (!body?.code?.trim()) throw badRequest('缺少 code')
    const code = normalizeCode(body.code)
    const name = body.name?.trim()
    if (!name) {
      const stock = await ctx.tencent.getStock(code).catch(() => null)
      if (!stock) throw notFound(`无法识别股票:${code}`)
      return recordBrowse(ctx.db, code, stock.name)
    }
    return recordBrowse(ctx.db, code, name)
  })
}
