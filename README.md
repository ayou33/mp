# mp — K线看板

我的持仓 · TradingView 风格 A 股日 K 看板(V1:真实 A 股日线 K 线渲染)。

## 技术栈

- React 19 + Vite 8 + TypeScript
- [lightweight-charts](https://github.com/tradingview/lightweight-charts)(TradingView 官方开源图表库)
- 数据源:腾讯免费行情接口(`web.ifzq.gtimg.cn`,前复权日 K)
  - 该接口 CORS 头不稳定(部分浏览器会报 NetworkError),故通过 Vite 同源代理转发(见 `vite.config.ts` 的 `/api` 代理),浏览器请求 `/api/...` 即可

## 本地运行

包管理器限定 **pnpm**(`packageManager` 字段 + `preinstall` 脚本强制,用 npm/yarn 安装会报错退出)。

```bash
pnpm install
pnpm dev        # 打开 http://localhost:5173
```

生产构建:

```bash
pnpm build      # tsc -b && vite build
pnpm preview
```

## 功能

- 默认加载贵州茅台(sh600519)日线 K 线
- 顶栏输入框支持 `600519` / `sh600519` / `000001` 等格式,回车切换股票
- 红涨绿跌、十字光标、滚轮缩放、拖拽平移、成交量副图
- 接口失败时显示错误提示,不白屏
