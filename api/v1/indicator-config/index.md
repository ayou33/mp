# GET /api/v1/indicator-config · PUT /api/v1/indicator-config

指标配置(用户实例配置,对齐 web 的 `mp_indicator_config`)。

## GET

响应 200 `IndicatorConfig`(见 `common/types.md`),缺省 `{ "custom": {} }`。

## PUT — 全量保存

请求 `IndicatorConfig`:

```json
{
  "custom": {
    "u_lxyz_abc123": { "enabled": true, "pane": "overlay", "params": {}, "lineStyles": {}, "rev": 3 }
  }
}
```

响应 200 保存后的 `IndicatorConfig`。

## 说明

- 全量替换 + `rev`(或 `updatedAt`)乐观锁;409 `CONFLICT` 时由客户端合并后重试。
- `custom` 下每条对应一个自定义指标实例;`enabled=false` 不渲染但仍保留配置。
