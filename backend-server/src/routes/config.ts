import type { FastifyInstance } from 'fastify'
import { type IndicatorConfig, type UserSettings } from '@mp/shared'
import type { Ctx } from '../app'
import { getKv, setKv } from '../db'
import { badRequest } from '../errors'

const DEFAULT_SETTINGS: UserSettings = { defaultPeriod: 'day', redUp: true, highLowStyle: 'leader' }
const DEFAULT_INDICATOR_CONFIG: IndicatorConfig = { custom: {} }

export function registerConfigRoutes(app: FastifyInstance, ctx: Ctx): void {
  /** GET/PUT /api/v1/indicator-config */
  app.get('/indicator-config', async () => getKv(ctx.db, 'indicator_config', DEFAULT_INDICATOR_CONFIG))

  app.put('/indicator-config', async (req) => {
    const body = req.body as IndicatorConfig | null
    if (!body || typeof body !== 'object' || typeof body.custom !== 'object') throw badRequest('indicator-config 需为 { custom: {...} }')
    setKv(ctx.db, 'indicator_config', body)
    return getKv(ctx.db, 'indicator_config', DEFAULT_INDICATOR_CONFIG)
  })

  /** GET/PUT /api/v1/settings */
  app.get('/settings', async () => getKv(ctx.db, 'settings', DEFAULT_SETTINGS))

  app.put('/settings', async (req) => {
    const body = req.body as UserSettings | null
    if (!body || typeof body !== 'object') throw badRequest('settings 需为对象')
    setKv(ctx.db, 'settings', body)
    return getKv(ctx.db, 'settings', DEFAULT_SETTINGS)
  })
}
