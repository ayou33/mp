# 错误结构

所有错误响应统一为:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "公式错误:未知函数 FOO",
    "details": { }
  }
}
```

类型:`ApiErrorBody`(见 `types.md`)。

## 错误码

| HTTP | code | 说明 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | 参数缺失/格式错误 |
| 401 | `UNAUTHORIZED` | 未登录 / 令牌失效 |
| 404 | `NOT_FOUND` | 股票 / 公式 / 资源不存在 |
| 409 | `CONFLICT` | 版本冲突(乐观锁,基于 `updatedAt`) |
| 422 | `VALIDATION_ERROR` | 业务校验失败(如公式编译失败),`details.message` 带具体原因 |
| 429 | `RATE_LIMITED` | 行情限流,可重试 |
| 502 | `UPSTREAM_ERROR` | 腾讯行情接口异常,可重试 |

## 样例

```json
// 422 公式编译失败
{ "error": { "code": "VALIDATION_ERROR", "message": "公式错误:未知函数 FOO", "details": { "pos": 0 } } }

// 404 股票不存在
{ "error": { "code": "NOT_FOUND", "message": "未找到股票:sh999999" } }
```
