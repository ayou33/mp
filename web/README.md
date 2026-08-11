# mp — K 线看板

TradingView 风格 A 股日 K 看板:真实行情渲染、自研画线工具与指标系统。默认加载上证指数(`sh000001`)。

## 技术栈

- **React 19 + Vite 8 + TypeScript**,样式 **Tailwind CSS v4**(utility + `@theme` 深色 token)
- **lightweight-charts v5**(TradingView 官方开源库)的 series 与 primitives API
- **画线工具 / 斐波那契 / 指标均为自研**,不走 klinecharts
- 包管理器 **pnpm**(按 `packageManager` 字段声明的版本)

## 本地运行

```bash
pnpm install
pnpm dev         # 打开 http://localhost:5173
pnpm build       # tsc -b && vite build(唯一校验,含 TS 类型检查)
pnpm preview     # 预览生产构建
```

无测试框架、无 lint 配置。

## 功能

### 图表

- 真实 A 股日 K(腾讯免费行情接口,前复权),顶栏输入 `600519` / `sh600519` 等格式切换股票
- 红涨绿跌、十字光标、滚轮缩放、拖拽平移(含垂直)、成交量副图、中文时间轴
- 右键框选区间 → 区间统计(交易日数/OHLC/涨跌幅/振幅/成交量)
- 可见区间高/低点标注(引线 / 价格线两种样式)、十字线距今涨幅标签

### 画线工具(自研,localStorage 持久化)

- **9 种工具**:水平价格线、线段 / 射线 / 直线、矩形、测量(价差/涨跌幅/根数)、斐波那契回调、斐波那契扩展(三点)、垂直线、文本标注、操作价格线(目标价 + 开/加/减/清,股价到达触发后确认执行)
- 画线模式互斥、右键退出画线模式、锚点拖拽/价格编辑、换股自动切换存储 key

### 指标

- **主图**:MA / EMA / BBI / BOLL
- **副图**:RSI / MACD / KDJ / WR / CCI / OBV / ATR / DMI
- 每个指标可编辑**参数**(周期、快慢线等)与**输出线样式**(线色 / 线宽 / 线型)
- 副图 pane 按激活先后排列,顶部指标栏点击开关;顶栏「+自定义指标」手写公式定义指标,保存后追加到指标栏(默认不激活,点击名称切换激活,移除在设置弹窗)

### 自定义指标(公式 DSL)

- 字段 `CLOSE(C)` / `OPEN(O)` / `HIGH(H)` / `LOW(L)` / `VOLUME(V)`;函数 `SMA/MA/EMA/STDDEV/SUM/HHV/LLV/WILDER/REF/REFX/BARSCOUNT/ABS/MAX/MIN/CROSSOVER/CROSSUNDER/IF`,支持比较/逻辑运算与 `{...}` 注释
- 多输出脚本:每行 `NAME = EXPR` 定义一条输出线,`NAME := EXPR` 定义私有中间变量(只计算不渲染);可引用内置指标成员(`KDJ().K`、`MACD().DIF/DEA/MACD`、`BOLL().MID/UPPER/LOWER`、`RSI()` 等);行尾声明线色/线宽/线型
- 输出形态:折线 / 面积 / 柱状 / 基线 / 区间(每行独立选择,band 需下轨),另有 `STICKLINE` 竖条;每线可配显示名、Y 轴(主轴/独立轴)、显示开关
- 弹窗「测试」按钮:与保存一致的编译校验 + 对当前 K 线(无数据用合成样例)求值统计(有效点数/min/max/最新值),提交前确认指标可正常显示

### 其他

- 右侧自选 / 浏览(自选持久化 `mp_watchlist`),设置弹窗(默认周期、红涨绿跌、高/低点标注样式,并在此移除自定义指标;用户设置持久化 `mp_settings`)
- 顶部指标栏常显全部指标、激活蓝字 + 底部短 bar,内容超宽时隐藏滚动条、鼠标滚轮平滑横向滚动

## 数据流:必须走 Vite 代理

腾讯接口(`web.ifzq.gtimg.cn`)的 CORS 头不稳定,浏览器直连会报 NetworkError。前端请求相对路径 `/api/...`,由 `vite.config.ts` 代理到腾讯域名(带 `Referer: https://gu.qq.com/`)。此代理只在 `dev`/`preview` 生效;部署 `dist` 需反向代理实现同样规则。

## 目录结构

```
src/
  api/         数据层(腾讯接口 + 代码规范化)
  chart/       图表辅助逻辑(非 React):价格区间适配、历史加载、可见高低点、涨幅标签
  components/  布局 + 弹窗 + 图表壳(React 层,只做渲染与事件接线)
  drawing/     自研画线子系统(非 React):控制器 + primitive + 序列化持久化
  indicators/  指标子系统(非 React):纯函数计算 + series 装配 + 参数/样式编辑 + custom/(自定义指标框架:公式 DSL + 声明式定义)
  data/        常用 A 股清单
```

各目录以 `AGENTS.md` 为唯一文档正文(内含结构、约定与关键坑),Codex 原生读取;同目录 `CLAUDE.md` 仅含一行 `@AGENTS.md` 导入供 Claude Code 使用。修改文档只需更新 AGENTS.md,无需改动 CLAUDE.md。
