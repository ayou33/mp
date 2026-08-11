import { afterEach, describe, expect, it } from 'vitest'
import { clearMocks, makeApp, sampleRawBars } from './helpers'

const stocks = { sh600519: { name: '贵州茅台', bars: sampleRawBars() } }

describe('settings / indicator-config / browse-history', () => {
  afterEach(clearMocks)

  it('settings:GET 默认,PUT 后回读', async () => {
    const app = makeApp(stocks)
    const get = await app.inject({ method: 'GET', url: '/api/v1/settings' })
    expect(get.json()).toEqual({ defaultPeriod: 'day', redUp: true, highLowStyle: 'leader' })
    const put = await app.inject({ method: 'PUT', url: '/api/v1/settings', payload: { defaultPeriod: 'week', redUp: false, highLowStyle: 'price-line' } })
    expect(put.json()).toEqual({ defaultPeriod: 'week', redUp: false, highLowStyle: 'price-line' })
    const again = await app.inject({ method: 'GET', url: '/api/v1/settings' })
    expect(again.json().defaultPeriod).toBe('week')
  })

  it('indicator-config:GET 默认 { custom:{} },PUT 后回读', async () => {
    const app = makeApp(stocks)
    const get = await app.inject({ method: 'GET', url: '/api/v1/indicator-config' })
    expect(get.json()).toEqual({ custom: {} })
    const payload = { custom: { u_1: { enabled: true, pane: 'overlay', params: {}, lineStyles: {} } } }
    const put = await app.inject({ method: 'PUT', url: '/api/v1/indicator-config', payload })
    expect(put.json()).toEqual(payload)
  })

  it('browse-history:记录去重置顶,GET 最近优先', async () => {
    const app = makeApp(stocks)
    await app.inject({ method: 'POST', url: '/api/v1/browse-history', payload: { code: 'sh600519', name: '贵州茅台' } })
    await app.inject({ method: 'POST', url: '/api/v1/browse-history', payload: { code: 'sh600519' } })
    const res = await app.inject({ method: 'GET', url: '/api/v1/browse-history' })
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ code: 'sh600519', name: '贵州茅台' })
  })

  it('未知路由返回统一 404 结构', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_FOUND')
  })
})
