# GET /api/v1/settings · PUT /api/v1/settings

用户设置(对齐 web 的 `mp_settings`)。

## GET

响应 200 `UserSettings`(见 `common/types.md`),缺省:

```json
{ "defaultPeriod": "day", "redUp": true, "highLowStyle": "leader" }
```

## PUT

请求 `UserSettings` 全量;响应 200 保存后的值。

```json
{ "defaultPeriod": "day", "redUp": true, "highLowStyle": "price-line" }
```
