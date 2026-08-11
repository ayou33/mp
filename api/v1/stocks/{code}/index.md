# GET /api/v1/stocks/{code}

单只股票元信息(规范化代码 → 名称/市场/类型)。

## 请求

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `code` | path | string | 是 | 规范化代码或 6 位数字(服务端规范化),如 `sh600519` |

## 响应 200

`Stock`(见 `common/types.md`):

```json
{ "code": "sh600519", "name": "贵州茅台", "market": "sh", "kind": "stock" }
```

## 错误

- 404 `NOT_FOUND`:代码无法识别或无此股票。
