# GET /api/v1/formulas · POST /api/v1/formulas

用户公式列表 / 新建。

## GET — 列表

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `limit` | query | number | 否 | 缺省 100 |

响应 200 `FormulaRecord[]`(见 `common/types.md`),按创建顺序:

```json
[
  {
    "id": "u_lxyz_abc123", "title": "双均线差", "shape": "line",
    "formula": "SMA(CLOSE,5) - SMA(CLOSE,20)", "rev": 3,
    "createdAt": "2026-08-01T08:00:00Z", "updatedAt": "2026-08-10T09:00:00Z"
  }
]
```

## POST — 新建

请求 `FormulaRecord` 去掉只读字段(`id/rev/createdAt/updatedAt`):

```json
{
  "title": "双均线差",
  "shape": "line",
  "formula": "SMA(CLOSE,5) - SMA(CLOSE,20)"
}
```

响应 201 `FormulaRecord`(服务端补齐 `id/rev/createdAt/updatedAt`)。

## 错误

- 400 `BAD_REQUEST`:缺少 `title` / `formula`。
- 422 `VALIDATION_ERROR`:公式编译失败(带 `details.message`)。
