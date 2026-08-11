# GET /api/v1/formulas/{id} · PUT /api/v1/formulas/{id} · DELETE /api/v1/formulas/{id}

单条公式读取 / 更新 / 删除。

## GET — 读取

响应 200 `FormulaRecord`。

## PUT — 更新

请求:可更新的字段(`title/shape/formula/formula2/baseValue/color/outputSpecs`),缺省保持原值。

响应 200 `FormulaRecord`;`rev = 原 rev + 1`,`updatedAt` 刷新。

- 409 `CONFLICT`:请求带 `updatedAt` 且与服务端不一致(乐观锁)。

## DELETE — 删除

响应 204;同时注销对应指标定义,已引用它的实例停止渲染。

## 错误

- 404 `NOT_FOUND`:公式不存在。
- 422 `VALIDATION_ERROR`:更新后公式编译失败。