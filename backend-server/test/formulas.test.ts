import { afterEach, describe, expect, it } from 'vitest'
import { clearMocks, makeApp, sampleRawBars, toBars } from './helpers'

const stocks = { sh600519: { name: '贵州茅台', bars: sampleRawBars() } }

describe('formulas', () => {
  afterEach(clearMocks)

  it('POST/GET/PUT/DELETE 公式 CRUD,PUT 后 rev+1', async () => {
    const app = makeApp(stocks)
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/formulas',
      payload: { title: '双均线差', shape: 'line', formula: 'SMA(CLOSE,5) - SMA(CLOSE,20)' },
    })
    expect(create.statusCode).toBe(201)
    const rec = create.json()
    expect(rec.rev).toBe(1)
    expect(rec.id).toMatch(/^u_/)

    const list = await app.inject({ method: 'GET', url: '/api/v1/formulas' })
    expect(list.json()).toHaveLength(1)

    const upd = await app.inject({
      method: 'PUT',
      url: `/api/v1/formulas/${rec.id}`,
      payload: { formula: 'EMA(CLOSE,5)' },
    })
    expect(upd.statusCode).toBe(200)
    expect(upd.json().rev).toBe(2)
    expect(upd.json().formula).toBe('EMA(CLOSE,5)')

    const del = await app.inject({ method: 'DELETE', url: `/api/v1/formulas/${rec.id}` })
    expect(del.statusCode).toBe(204)
    const after = await app.inject({ method: 'GET', url: '/api/v1/formulas' })
    expect(after.json()).toHaveLength(0)
  })

  it('POST 非法公式返回 422 VALIDATION_ERROR', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/formulas',
      payload: { title: 'x', shape: 'line', formula: 'FOO(CLOSE)' },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('POST /formulas/test:合法公式 ok=true,非法公式 200 + ok=false + compileError', async () => {
    const app = makeApp(stocks)
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/formulas/test',
      payload: { formula: 'SMA(CLOSE,5) - SMA(CLOSE,20)', shape: 'line', bars: toBars(sampleRawBars(120)) },
    })
    expect(ok.statusCode).toBe(200)
    const r = ok.json()
    expect(r.ok).toBe(true)
    expect(r.outputs[0].valid).toBeGreaterThan(0)
    expect(r.dataSource).toContain('真实')

    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/formulas/test',
      payload: { formula: 'FOO(CLOSE)', bars: toBars(sampleRawBars(120)) },
    })
    expect(bad.statusCode).toBe(200)
    expect(bad.json().ok).toBe(false)
    expect(bad.json().compileError).toContain('未知函数')
  })

  it('POST /formulas/test:脚本私有变量 + KDJ 成员引用 + band 均正常', async () => {
    const app = makeApp(stocks)
    const script = await app.inject({
      method: 'POST',
      url: '/api/v1/formulas/test',
      payload: {
        formula: 'DIF := EMA(CLOSE,12) - EMA(CLOSE,26)\nDEA = EMA(DIF,9)\nHIST = (DIF - DEA) * 2',
        bars: toBars(sampleRawBars(120)),
      },
    })
    expect(script.json().ok).toBe(true)
    expect(script.json().outputs).toHaveLength(2)

    const kdj = await app.inject({
      method: 'POST',
      url: '/api/v1/formulas/test',
      payload: { formula: 'KDJ(9,3,3).J - KDJ(9,3,3).K', bars: toBars(sampleRawBars(120)) },
    })
    expect(kdj.json().ok).toBe(true)

    const band = await app.inject({
      method: 'POST',
      url: '/api/v1/formulas/test',
      payload: { formula: 'SMA(CLOSE,20)', formula2: 'SMA(CLOSE,20) - STDDEV(CLOSE,20)*2', shape: 'band', bars: toBars(sampleRawBars(120)) },
    })
    expect(band.json().ok).toBe(true)
    expect(band.json().outputs[0].shape).toBe('band')
  })
})
