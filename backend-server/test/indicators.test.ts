import { afterEach, describe, expect, it } from 'vitest'
import { clearMocks, makeApp, sampleRawBars, toBars } from './helpers'

const stocks = { sh600519: { name: '贵州茅台', bars: sampleRawBars(160) } }
const bars = toBars(sampleRawBars(160))

describe('indicators/calc', () => {
  afterEach(clearMocks)

  it('内置 macd(bars 传入)返回 DIF/DEA/MACD', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/indicators/calc',
      payload: { bars, indicators: [{ id: 'macd' }] },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.barsCount).toBe(160)
    expect(body.outputs.macd.map((o: { key: string }) => o.key)).toEqual(['DIF', 'DEA', 'MACD'])
    expect(body.outputs.macd[2].type).toBe('histogram')
  })

  it('公式路径(code 拉取)输出 main', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/indicators/calc',
      payload: { code: 'sh600519', period: 'day', indicators: [{ formula: 'SMA(CLOSE,5) - SMA(CLOSE,20)', shape: 'line' }] },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.code).toBe('sh600519')
    expect(body.outputs.main[0].key).toBe('main')
  })

  it('code 与 bars 都缺 → 400', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({ method: 'POST', url: '/api/v1/indicators/calc', payload: { indicators: [{ id: 'ma' }] } })
    expect(res.statusCode).toBe(400)
  })

  it('未知指标/公式 → 422', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({ method: 'POST', url: '/api/v1/indicators/calc', payload: { bars, indicators: [{ id: 'nope' }] } })
    expect(res.statusCode).toBe(422)
  })
})
