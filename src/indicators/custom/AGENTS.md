# src/indicators/custom

自定义指标框架(非 React),含 **TS 声明式指标定义**与**用户公式 DSL**两条路径:

- **声明式路径**:用 `defineIndicator()` 写类型安全的指标定义,编译期校验,改代码即扩展(供开发者/内置参考实现,如 demos.ts)。
- **公式路径**(弹窗主入口):用户在 `CustomIndicatorDialog` 手写公式(如 `SMA(CLOSE,5) - SMA(CLOSE,20)`),经 `parseFormula` → AST → `evaluateFormula` 在 CalcContext 上求值,`defineFormulaIndicator` 编译为 `CustomIndicatorDef`,注册进 `CUSTOM_INDICATORS` 后走同一渲染管线。

两者最终都产出 `CustomIndicatorDef`,`CustomIndicatorManager`/`CustomIndicatorInstance` 渲染一致。

## 概念分层

```
src/indicators/custom/
  lib.ts                      值级纯函数库:入参/返回都是 (number|null)[] = NumArr
                              sma/ema/stddev/sum/hhv/llv/wilder/ref/abs/max/min/crossOver/crossUnder/hexToRgba
  types.ts                    CustomIndicatorDef / CustomParamSpec / CustomOutput(7 形态) / CustomScale
                              / CalcContext / CustomIndicatorConfigEntry
  defineIndicator.ts          工厂:校验 id/params/outputs keys 合法、defaultParams/resolveParams 解析钳制
  formula.ts                  公式 DSL:注释剥离 → tokenize → 递归下降解析(算术/比较/逻辑 AND OR NOT/IF/指标引用)
                              → evaluateNode/evaluateFormula 求值;FormulaError(带位置) + FORMULA_FIELDS/FORMULA_FUNCS 帮助清单
                              parseFormulaScript(多语句脚本,含单冒号输出与 STICKLINE 裸语句)→ evaluateFormulaScript(变量引用求值,标量变量保留数字语义)
                              ;parseFormulaExpr(允许变量引用的单表达式,供脚本 band 下轨)
  formulaIndicator.ts         公式 → CustomIndicatorDef:defineFormulaIndicator(spec) 缓存 AST;`NAME := EXPR` 私有变量只计算不渲染;outputSpecs 支持 label/scale/visible(显示名/独立轴/可见性)
FormulaShape / FormulaOutputSpec;FORMULA_PALETTE 脚本各线取色;outputSpecs 决定脚本各输出形态 + 行尾样式
userFormulas.ts             用户公式记录注册表:localStorage mp_custom_formulas 持久化(outputSpecs 脚本各输出形态 + 行尾样式),
                              registerUserFormula/unregisterUserFormula/loadUserFormulas/saveUserFormulas
  calcContext.ts              构造 CalcContext:注入 bars 字段序列、值函数库、bars 级常用指标包装
                              (ma/emaBar/macd/rsi/boll/kdj 复用 calcX)、ctx.points(values) 对齐时间
  BandPrimitive.ts            区间填充 primitive(自研,附在 band 上轨 series)
  CustomIndicatorInstance.ts  渲染器:按 Output.type 建 series(6 种 series + band)+ 轴标签/角标 + 十字光标/图例
  CustomIndicatorManager.ts   注册表 CUSTOM_INDICATORS + 实例生命周期 + 挂载位置编排 + pane 基数 + 多轴管理
  index.ts                    公共导出(import './demos' 副作用注册)
  demos.ts                    演示指标 cmacd/cboll/ckline/cmo(仅开发者参考,不参与顶栏 UI)
```

## 快速上手:写一个新指标

```ts
// src/indicators/custom/myCustom.ts
import { defineIndicator } from './defineIndicator'

export const myCustom = defineIndicator({
  id: 'myCustom',
  title: '我的指标',
  defaultPane: 'overlay',          // 用户可在编辑面板改,实例级选择
  params: [{ key: 'period', label: '周期', kind: 'number', default: 10, min: 1, max: 120 }],
  outputs: [
    { key: 'avg', label: '均值', type: 'line', color: '#f0b90b' },
    { key: 'band', label: '区间', type: 'band', color: '#2962ff' },
  ],
  calc(ctx, p) {
    const avg = ctx.points(ctx.sma(ctx.close, p.period as number))
    return [
      { type: 'line', key: 'avg', data: avg },
      {
        type: 'band', key: 'band',
        upper: ctx.points(ctx.max(avg.map(v => v?.value ?? null), ...) /* 见 demos.ts 实例 */),
        lower: ...,
      },
    ]
  },
})
// 然后在 registry 注册:import './myCustom'(在 demos.ts 里一并 import,或直接 import 于 index.ts)
```

常用指标包装(复用现有 calcX,不重写):
`ctx.ma(period)` → `IndicatorPoint[]`;`ctx.macd(fast, slow, signal)` → `{ dif, dea, macd }`;`ctx.rsi(period)`;`ctx.boll(period, stdDev)` → `{ mid, upper, lower }`;`ctx.kdj(period, kSmooth, dSmooth)`;`ctx.emaBar(period)`。

值级函数对 `(number|null)[]` 运算(等长输出,null 表示该位无效/预热),`ctx.points(values)` 按索引对齐 bars 时间并过滤 null → `IndicatorPoint[]`。跨序列运算用 `ctx.max(a, b)` 等(接受序列或标量)。

## 用户公式 DSL(弹窗主入口)

用户在 `CustomIndicatorDialog` 输入公式字符串定义指标,保存时 `registerUserFormula` 编译并注册。公式大小写不敏感,支持:

- **字段**:`CLOSE / OPEN / HIGH / LOW / VOLUME`(长度为 bars 数的 NumArr),支持单字母简写 `C / O / H / L / V`;简写与全名同为保留字。
- **值级函数**(入参/返回均为 `(number|null)[]`,数字常量自动广播为等长数组):
  `SMA(v,n)`(MA 为其别名)、`EMA(v,n)`、`STDDEV(v,n)`、`SUM(v,n)`、`HHV(v,n)`、`LLV(v,n)`、`WILDER(v,n)`、`REF(v,n)`、`REFX(v,n)`(未来引用)、`BARSCOUNT(v)`(有效值计数)、`ABS(v)`、`MAX(a,b)`、`MIN(a,b)`、`CROSSOVER(a,b)`、`CROSSUNDER(a,b)`、`IF(cond,a,b)`(逐元素条件选择)。
- **运算符**:算术 `+ - * /` 与括号;比较 `> >= < <= = <>`(= 为相等);逻辑 `AND / OR / NOT`;函数可嵌套(`EMA(EMA(CLOSE,12)-EMA(CLOSE,26),9)`);除零/无效点输出 null(渲染跳过)。
- **注释**:`{...}` 块注释(可跨行、可嵌套)与 `//` 行注释,解析前剥离。
- **变量**:名称支持 Unicode 字母(含中文,如 `大负均值`);`N := 244` 这类数字常量保留**标量语义**,可直接作函数参数(`SUM(X, N)`);输出可用 TDX 单冒号 `K:KDJ.K`(等价 `K = KDJ.K`)。
- **STICKLINE 裸语句**:`STICKLINE(cond, p1, p2, width, empty)` 独立成行绘制 p1→p2 竖条(自动命名 `stick1...`,bar 输出形态),可带行尾样式;宽/空心参数仅解析暂不参与渲染;不能带 `NAME =` 前缀。
- **指标成员引用**:`名称(参数).成员` / `名称().成员` / `名称.成员`(成员大小写不敏感),可参与任意表达式。多输出:KDJ().K/.D/.J、MACD().DIF/.DEA/.MACD、BOLL().MID/.UPPER/.LOWER、DMI().PDI/.MDI/.ADX/.ADXR;单输出直接返回:RSI()/CCI()/ATR()/OBV()/BBI()。参数缺省按默认从左补齐(如 `MACD(5)`);BBI 参数为周期列表(`BBI(5,10,20)`,空参用默认 `BBI_PERIODS`);裸指标名(如 `MACD()` 多输出无成员)报错;指标名(KDJ/MACD/...)为保留字。

### 两种公式形态

1. **单表达式**(无 `=`):输出 key 固定 `'main'`,按所选**形态**渲染:
   line / area / histogram / baseline(+基准值)/ band(主公式 + 下轨公式 `formula2`)。渲染器按 `def.outputs[0].type` 建 series。
2. **多输出脚本**(任一语句含 `=` / `:=` / 单冒号 `:`):每行 `NAME = EXPR` 或 `NAME:EXPR`(TDX 写法)(换行或 `;` 分隔)定义**一条输出**;`NAME := EXPR` 定义**私有中间变量**(如 `MID := SMA(C,20)`)——参与计算、可被后续行/band 下轨引用,但**不渲染为输出**。EXPR 可引用前面行的 `NAME`(如 MACD 的 DIF/DEA 组合)。裸 `STICKLINE(cond, p1, p2, width, empty)` 语句定义竖条输出(自动命名 `stickN`,bar 形态,不进入面板配置)。**每条输出可独立选择形态**(line / area / histogram / baseline / band),由 `outputSpecs`(key = 小写输出名)记录:band 需给 `lower` 下轨公式(可引用脚本变量),baseline 可给 `baseValue` 基准值;线样式按线独立调色/线宽/线型,色取自 `FORMULA_PALETTE`(可用行尾声明覆盖,见下)。**每条输出还可独立定义**:显示名 `label`(缺省 = 名称大写)、Y 轴 `scale`(主轴/独立轴,独立轴共用 id=`{id}_scale`)、可见性 `visible`(false = 不渲染/不进图例轴标签,但仍参与计算可被引用);缺省 label=名称大写、scale=主轴、visible=true。无 `outputSpecs` 的旧记录按全部 line 渲染(向后兼容);全私有脚本在构建期报错。

**行尾样式声明(通达信风格)**:每条输出语句(或单表达式)后可直接声明样式,顶层逗号分隔、关键字大小写不敏感:

```
MA5 = EMA(C,5), COLORRED, DASH, WIDTH2
```

- 线色:`COLORRED / COLORGREEN / COLORBLUE / COLORYELLOW / COLORWHITE / COLORMAGENTA / COLORCYAN / COLORPURPLE / COLORGRAY`,或 `COLORRRGGBB` / `COLORRRGGBBAA`(RGB 顺序;8 位最后两位为 alpha,如 `COLORFF550080` = 50% 透明)
- 线型:`SOLID / DASH / DOT`(`DASHED` / `DOTTED` 为别名);线宽:`WIDTH1`~`WIDTH4`(仅折线 / 基线形态生效)
- 样式唯一来源是**行尾声明**(缺省调色板);编辑面板不提供线色/线宽/线型,只负责形态/显示名/Y 轴/可见性
- 私有变量 `NAME := EXPR` 上的样式声明被**静默忽略**(不解析、不报错);未知/重复关键字与线宽越界仍在解析期报错(带位置)
- 行尾声明随 `outputSpecs`(单表达式为 `outputSpecs.main`)持久化;保存时清空该指标的历史面板样式覆盖(`lineStyles`),避免隐藏覆盖残留

**脚本约束**(`parseFormulaScript` 校验):
- 名称 `NAME` 需符合 `[\p{L}_][\p{L}\p{N}_]*`(支持中文);**不能是保留字**(字段名及简写 c/o/h/l/v、函数名、and/or/not/if/stickline 等)且不能重复;赋值语句后只允许 STICKLINE 裸语句(其他裸表达式报错);引用**未定义/前向引用**变量报「未知变量」。`NAME := EXPR` 的语句是**私有中间变量**:顺序求值进入变量表、可被后续行引用,但不进入 `def.outputs`(渲染层不建 series)。STICKLINE 必须 5 参且第 4/5 参为常量数字。
- 多输出经 `evaluateFormulaScript` 顺序求值,后语句可引用前语句结果。

**错误处理**:`parseFormula` / `parseFormulaScript` 抛 `FormulaError`(含出错位置 pos),弹窗保存前实时校验并展示错误;`loadUserFormulas` 跳过损坏/编译失败的记录。**不要在公式里引用未列出的字段/函数**(识别为语法错误)。

**DSL 边界**:脚本模式支持 line / area / histogram / baseline / band 五种形态(每行独立选择,band 需下轨);**K线 / 条形**不在公式路径内,需走声明式 `defineIndicator`。

## 7 种输出形态

| type | 数据字段 | 说明 |
| --- | --- | --- |
| line | `data: IndicatorPoint[]` | 折线,`color/width/style` 可逐输出指定 |
| area | `data` | 面积,`color` |
| histogram | `data: Array<IndicatorPoint & {color?}>` | 柱状,可逐点色(红涨绿跌风格) |
| baseline | `data` + `baseValue`(默认 0) | 基线,以 baseValue 为界上下分色(`topColor/bottomColor`) |
| candlestick | `data: CustomCandlePoint[]` | K线,`upColor/downColor` 缺省红涨绿跌,可逐点 color |
| bar | `data: CustomCandlePoint[]` | 条形,同上 |
| band | `upper/lower: IndicatorPoint[]` | 区间填充,`opacity`(默认 0.15)控制透明度,上下轨画线 |

`outputs` 元数据(输出默认样式列表)必须与 `calc` 返回的 Output **key 对齐**;每个输出默认 Y 轴 `scale`(缺省 `kind:'right'` 与同 pane 主轴共用)。

## 关键坑

### 1. 就地更新状态对象(同 indicators/AGENTS.md 坑 1)

`CustomIndicatorInstance` 内部 primitive(轴标签/角标/BandPrimitive)构造时捕获状态对象**引用**,更新必须就地改属性 + `requestUpdate?.()`,**绝不整体替换**。

### 2. 输出 key 集合跨 update 必须稳定

实例按 Output.key 匹配已建 series;`calc` 返回的 key 集合变化会触发重建(manager 按 `JSON.stringify([config, paneBase])` 检测签名变化)。不要在 calc 里按参数条件性返回不同 key 集合。

### 3. series 创建顺序:band/histogram 先建、line 后建

lightweight-charts 后添加的 series 绘制在上层。副图内柱/区间垫底、线在最上(沿用 SubChartIndicator 约定)。

### 4. 主图叠加的 Y 轴策略

- 主轴 `'right'`:主图 autoScale 为 false(垂直拖动),叠加值**必须与 K 线价格同量级**,否则不可见。
- 独立轴 `{ kind: 'independent', id }`:自定义 priceScaleId 建独立轴,`autoScale: true` 自适配,与主图主轴解耦(振荡类指标用独立轴或放副图)。同一 pane 内可多个独立轴并列;轴随最后一个 series 移除自动消失,实例销毁时不用显式删轴。
- 副图 series 一律 `autoScale: true` + `scaleMargins { top: 0.12, bottom: 0.12 }`。

### 5. Band 上下轨必须时间对齐

`upper`/`lower` 同索引同长度同时间,否则填充多边形错位。BandPrimitive 用 `chart.timeScale().timeToCoordinate` + 双 series `priceToCoordinate` 构建填充。

### 6. v5 API 注意

- 系列创建一律 `chart.addSeries(CandlestickSeries, opts)` 风格(不用 v4 `addCandlestickSeries`)。
- `IPriceScaleApi` 无 `.id()`:取轴 id 用 `series.options().priceScaleId ?? 'right'`。
- band 双线必须共享同一 priceScaleId(构造时校验,不符抛错);band 的填充经自研 BandPrimitive,不走 v4 `createPriceLine`。

### 7. 挂载位置实例级选择

`config.custom[id].pane: 'overlay' | 'sub'` 用户在启用/编辑时选择(定义层 `defaultPane` 仅作默认)。切 pane 时销毁旧实例、按新位置重建。副图 pane 基数是 `1 + 内置副图数`,由 IndicatorController 在 `_syncSubCharts` 时传入。

## 数据流与约定

- 配置持久化在 `IndicatorConfig.custom[id]: CustomIndicatorConfigEntry`(`{ enabled, pane, params, lineStyles, scales, rev }`),随 `mp_indicator_config` JSON 存储,老配置缺省 `{}` 合并兼容。
- **`rev?: number` 必须随公式文本/参数变更递增**:`CustomIndicatorManager` 按 `JSON.stringify(entries)+paneBase` 检测签名;仅改公式文本时若 `rev` 不变,manager 不会重建实例,画面不更新。每次弹窗保存 `rev = (entry?.rev ?? 0) + 1`。
- 公式记录(公式文本/形态/名称 + 输出配置 `outputSpecs`(形态 + 行尾样式))持久化在 **`mp_custom_formulas`**(`UserFormulaRecord`),与实例配置 `mp_indicator_config` 分离。删除公式记录即注销定义;仍存在于配置里的实例会因定义缺失而跳过渲染。
- 值级函数输出 `(number|null)[]`,`null` = 无效/预热期;`ctx.points()` 负责过滤与时间对齐。**不要**直接向 series 喂含 null 的数组。
- 渲染层所有颜色默认走 def 的 `outputs[].color` 或类型缺省(红涨绿跌等);内置指标编辑面板覆盖进 `lineStyles`,公式指标样式由行尾声明决定(保存时清空该实例 `lineStyles`)。
- 新增自定义指标:**写 defineIndicator → import 注册(推荐放 demos.ts 或新文件在 index.ts 引入)→ 无需改 IndicatorController**(纯注册制)。**顶栏 `+自定义指标` 入口走公式 DSL**(见公式 DSL 节),声明式指标不展示在顶栏。
