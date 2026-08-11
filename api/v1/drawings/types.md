# GET /api/v1/drawings/types

系统支持的画线类型与操作方法目录(MCP 服务「查询画线类型和操作方法」;也供 web 帮助面板使用)。

## 请求

无参数。

## 响应 200

`DrawingTypeInfo[]`(见 `common/types.md`):

```json
[
  {
    "id": "price-line", "name": "水平价格线", "description": "点击图表放置水平价格线",
    "ops": { "place": "开启工具后点击图表放置", "edit": "拖拽移动 / 输入框精确改价", "clear": "选中删除 / 一键清除全部 user 对象" },
    "defaultSource": "user"
  },
  {
    "id": "action-line", "name": "操作价格线", "description": "目标价 + 开/加/减/清,股价到达触发后确认执行",
    "ops": { "place": "开启后点击图表选择操作类型", "edit": "拖拽改价重算触发方向", "clear": "仅系统可改删(确认交互为画布实现)" },
    "defaultSource": "system"
  }
]
```

## 类型清单(9 种)

| id | 名称 | 放置 | 归属 |
| --- | --- | --- | --- |
| `price-line` | 水平价格线 | 点击放置 | user |
| `line` | 线段 / 射线 / 直线(`lineType` 区分) | 两点 | user |
| `rect` | 矩形(支撑/压力) | 两点对角 | user |
| `measure` | 测量(价差/涨跌幅/根数) | 两点 | user |
| `fib` | 斐波那契回调 | 两点 | user |
| `fib-ext` | 斐波那契扩展(A/B/C 三点) | 三点 | user |
| `vertical-line` | 垂直线(标记日期) | 点击 | user |
| `text` | 文本标注 | 点击 + 输入 | user |
| `action-line` | 操作价格线(目标价 + 开/加/减/清) | 点击 + 选操作 | system |