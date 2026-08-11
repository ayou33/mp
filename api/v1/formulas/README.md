# formulas — 用户公式

`/api/v1/formulas` 资源树:

```
formulas/
  README.md
  index.md       GET/POST  /formulas
  test.md        POST      /formulas/test
  {id}/
    index.md     GET/PUT/DELETE /formulas/{id}
```

- 公式 DSL 与 web `src/indicators/custom/formula.ts` 完全同语义(字段 `CLOSE(C)/OPEN(O)/HIGH(H)/LOW(L)/VOLUME(V)`,函数 `SMA/MA/EMA/STDDEV/SUM/HHV/LLV/WILDER/REF/REFX/BARSCOUNT/ABS/MAX/MIN/CROSSOVER/CROSSUNDER/IF`,多输出脚本 `NAME = EXPR` / 私有变量 `NAME := EXPR`,指标成员引用 `KDJ().K` 等)。
- 保存/更新必须通过服务端**编译校验**(失败返回 422);`rev` 随保存自增,触发指标实例重建。
- 新建时服务端生成 `id`(`u_<timestamp36>_<rand>` 风格)。
