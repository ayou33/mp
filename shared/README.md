# @mp/shared

mp 仓库的**共享契约与计算引擎**(非 React、无 DOM 依赖),backend-server 与未来的 mcp-server / web 共用。

## 内容

- **类型契约**:`src/types.ts` 与 `api/v1/common/types.md` 对齐(行情/指标/自选/浏览/公式/配置/设置/画线 DTO + 底层 `KlineBar`/`IndicatorPoint`/`LineStyle`)。
- **内置指标**:`src/indicators/` 纯函数 + `BUILTIN_INDICATORS` 注册表(参数 key 与 web `subCharts.ts`/`editorMeta.ts` 对齐)。
- **公式 DSL**:`src/indicators/custom/` 解析/求值/定义工厂/测试引擎(与 web 同语义,去掉 lightweight-charts 运行时依赖)。
- **工具**:`normalizeCode` / 股票名称索引 / 画线类型目录。

## 构建

```bash
pnpm --filter @mp/shared build   # tsup → dist(ESM + d.ts)
```

## 说明

web 已切换到本包(2026-08):`web/src/indicators` 与 `custom` 的纯计算/公式引擎文件已删除,只保留渲染/UI/localStorage 持久化;`web/` 通过 `@mp/shared`(dist)消费,与 backend 单一实现。
