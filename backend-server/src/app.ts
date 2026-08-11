import Fastify, { type FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import type { TencentClient } from './tencent'
import { toErrorBody } from './errors'
import { registerStockRoutes } from './routes/stocks'
import { registerIndicatorRoutes } from './routes/indicators'
import { registerWatchlistRoutes } from './routes/watchlist'
import { registerBrowseHistoryRoutes } from './routes/browseHistory'
import { registerFormulaRoutes } from './routes/formulas'
import { registerConfigRoutes } from './routes/config'
import { registerDrawingRoutes } from './routes/drawings'

/** 路由共享上下文:数据库 + 行情客户端 */
export interface Ctx {
  db: Database.Database
  tencent: TencentClient
}

/** 装配 Fastify 实例:统一错误处理 + 按 api/v1 目录注册全部路由 */
export function createApp(ctx: Ctx): FastifyInstance {
  const app = Fastify({ logger: false })

  app.setErrorHandler((err, _req, reply) => {
    const { statusCode, body } = toErrorBody(err)
    return reply.status(statusCode).send(body)
  })

  app.setNotFoundHandler((req, reply) => {
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `路由不存在:${req.method} ${req.url}` } })
  })

  app.register(async (i) => registerStockRoutes(i, ctx), { prefix: '/api/v1/stocks' })
  app.register(async (i) => registerIndicatorRoutes(i, ctx), { prefix: '/api/v1/indicators' })
  app.register(async (i) => registerWatchlistRoutes(i, ctx), { prefix: '/api/v1/watchlist' })
  app.register(async (i) => registerBrowseHistoryRoutes(i, ctx), { prefix: '/api/v1/browse-history' })
  app.register(async (i) => registerFormulaRoutes(i, ctx), { prefix: '/api/v1/formulas' })
  app.register(async (i) => registerConfigRoutes(i, ctx), { prefix: '/api/v1' })
  app.register(async (i) => registerDrawingRoutes(i, ctx), { prefix: '/api/v1/drawings' })

  return app
}
