import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 腾讯行情接口 CORS 头不稳定,统一走同源代理,由 Vite 服务器端转发,彻底绕开跨域
const tencentStockProxy = {
  target: 'https://web.ifzq.gtimg.cn',
  changeOrigin: true,
  headers: { Referer: 'https://gu.qq.com/' },
  rewrite: (path: string) => path.replace(/^\/api/, ''),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': tencentStockProxy,
    },
  },
  preview: {
    proxy: {
      '/api': tencentStockProxy,
    },
  },
})
