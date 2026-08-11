# POST /api/v1/formulas/test

公式试运行:与保存**同一套编译校验**,再对数据求值并逐输出统计(即 web 弹窗「测试」按钮的服务端化)。

## 请求

`FormulaTestRequest`(见 `common/types.md`):

```json
{
  "formula": "SMA(CLOSE,5) - SMA(CLOSE,20)",
  "shape": "line",
  "code": "sh600519"
}
```

| 字段 | 说明 |
| --- | --- |
| `formula` | 必填;单表达式或多输出脚本 |
| `shape` / `formula2` / `baseValue` / `outputSpecs` | 形态配置(与保存一致) |
| `code` | 用真实行情数据测试;缺省用服务端合成样例数据 |
| `bars` | 也可直接传数据(二选一) |

## 响应 200

`FormulaTestResult`:

```json
{
  "ok": true,
  "dataSource": "真实 K 线 320 根",
  "outputs": [
    { "key": "main", "label": "MAIN", "shape": "line", "valid": 301, "total": 320, "min": -2.31, "max": 7.47, "last": -2.01 }
  ],
  "emptyKeys": []
}
```

- `ok=false` + `compileError`:编译未通过(与保存一致的校验信息)。
- `ok=false` + `evalError`:求值期错误(如指标成员不存在)。
- `emptyKeys`:无有效数据点的输出(渲染为空,警告)。

## 错误

- 422 `VALIDATION_ERROR`:编译失败(同 `compileError`)。
