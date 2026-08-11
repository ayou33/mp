import { createApp } from './app'
import { openDb } from './db'
import { createTencentClient } from './tencent'
import { config } from './config'

const db = openDb(config.dbPath)
const tencent = createTencentClient()
const app = createApp({ db, tencent })

app
  .listen({ port: config.port, host: '0.0.0.0' })
  .then((addr) => {
    console.log(`mp backend-server listening on ${addr}`)
  })
  .catch((err) => {
    console.error('启动失败', err)
    process.exit(1)
  })
