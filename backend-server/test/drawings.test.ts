import { afterEach, describe, expect, it } from 'vitest'
import { clearMocks, makeApp, sampleRawBars } from './helpers'

const stocks = {
  sh600519: { name: '贵州茅台', bars: sampleRawBars() },
  sh000001: { name: '上证指数', bars: sampleRawBars() },
}

const userLine = { id: 1, kind: 'price-line', source: 'user', price: 100 } as const
const sysLine = { id: 2, kind: 'action-line', source: 'system', price: 150, action: 'add', status: 'armed', direction: 'up' } as const

describe('drawings', () => {
  afterEach(clearMocks)

  it('GET /drawings/types 返回 9 种画线类型', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({ method: 'GET', url: '/api/v1/drawings/types' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(9)
  })

  it('PUT 保存 + GET source 过滤 + DELETE 条件批量', async () => {
    const app = makeApp(stocks)
    await app.inject({
      method: 'PUT',
      url: '/api/v1/drawings',
      payload: { stock: 'sh600519', period: 'day', items: [userLine, sysLine] },
    })

    const all = await app.inject({ method: 'GET', url: '/api/v1/drawings?stock=sh600519&period=day' })
    expect(all.json()).toHaveLength(2)

    const user = await app.inject({ method: 'GET', url: '/api/v1/drawings?stock=sh600519&period=day&source=user' })
    expect(user.json()).toHaveLength(1)
    expect(user.json()[0].source).toBe('user')

    // 删除 system 类型
    const del = await app.inject({ method: 'DELETE', url: '/api/v1/drawings?stock=sh600519&period=day&source=system' })
    expect(del.statusCode).toBe(204)
    const after = await app.inject({ method: 'GET', url: '/api/v1/drawings?stock=sh600519&period=day' })
    expect(after.json().map((d: { id: number }) => d.id)).toEqual([1])
  })

  it('DELETE /drawings/{id} 删除单个', async () => {
    const app = makeApp(stocks)
    await app.inject({ method: 'PUT', url: '/api/v1/drawings', payload: { stock: 'sh600519', period: 'day', items: [userLine, sysLine] } })
    const del = await app.inject({ method: 'DELETE', url: '/api/v1/drawings/2?stock=sh600519&period=day' })
    expect(del.statusCode).toBe(204)
    const all = await app.inject({ method: 'GET', url: '/api/v1/drawings?stock=sh600519&period=day' })
    expect(all.json()).toHaveLength(1)
  })

  it('GET /watchlist/drawings 缺省只看系统类型', async () => {
    const app = makeApp(stocks)
    // 上证指数是默认自选,给它存两类画线
    await app.inject({
      method: 'PUT',
      url: '/api/v1/drawings',
      payload: { stock: 'sh000001', period: 'day', items: [userLine, sysLine] },
    })
    const res = await app.inject({ method: 'GET', url: '/api/v1/watchlist/drawings' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, Record<string, Array<{ source: string }>>>
    expect(body.sh000001.day.map((d) => d.source)).toEqual(['system'])
  })
})
