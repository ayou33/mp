/**
 * 画线子系统统一类型:
 * - 统一画线对象种类(DrawingKind)
 * - 统一存储格式(SerializedDrawing,可 JSON 化存储/回写)
 * - 统一操作引用(DrawingRef)
 */

/** 画线对象种类 */
export type DrawingKind =
  | 'line'
  | 'fib'
  | 'price-line'
  | 'action-line'
  | 'rect'
  | 'text'
  | 'vertical-line'
  | 'fib-ext'
  | 'measure'

/**
 * 画线对象归属(由「谁创建」决定,创建后不可转换):
 * - user:用户主动通过界面交互生成的画线对象(缺省),用户可修改/删除
 * - system:由程序生成、无用户交互的画线对象,用户不可修改/删除(可与所有类型交互),系统可操作一切
 */
export type DrawingSource = 'system' | 'user'

/** 两点画线类型:线段 / 射线 / 直线 */
export type LineType = 'segment' | 'ray' | 'straight'

/** 操作价格线的期望操作类型 */
export type ActionType = 'open' | 'add' | 'reduce' | 'close'

/** 操作价格线生命周期状态 */
export type ActionStatus = 'armed' | 'triggered' | 'executed' | 'violated'

/** 触发方向(创建时按目标价 vs 最新收盘价确定;拖拽改价后重算) */
export type ActionDirection = 'up' | 'down'

/** 画线锚点(序列化载体;time 固定为 'YYYY-MM-DD' 字符串) */
export interface AnchorPoint {
  time: string
  price: number
}

/**
 * 统一存储格式:所有画线对象的序列化载体。
 * 可整体 JSON.stringify 后存 localStorage / 导出文件,再 restoreAll 回写重建。
 * 字段按 kind 分布:
 * - line:        lineType + p1 + p2
 * - fib:         p1 + p2
 * - price-line:  price
 * - action-line: price(目标价) + action + status + direction + createdAt
 * - rect:        p1 + p2(对角)
 * - measure:     p1 + p2(测量两点)
 * - fib-ext:     p1 + p2 + p3(A/B/C 三点)
 * - text:        p1(锚点)+ text(文本内容)
 * - vertical-line: time(贯穿竖线,无价格)
 */
export interface SerializedDrawing {
  id: number
  kind: DrawingKind
  /** 线段类型(kind === 'line') */
  lineType?: LineType
  /** 锚点 1(kind === 'line' | 'fib' | 'rect' | 'measure' | 'fib-ext' | 'text') */
  p1?: AnchorPoint
  /** 锚点 2(kind === 'line' | 'fib' | 'rect' | 'measure' | 'fib-ext') */
  p2?: AnchorPoint
  /** 第三锚点(kind === 'fib-ext' 的 C 点) */
  p3?: AnchorPoint
  /** 文本内容(kind === 'text') */
  text?: string
  /** 时间(kind === 'vertical-line') */
  time?: string
  /** 价格(kind === 'price-line' | 'action-line';后者为目标价) */
  price?: number
  /** 期望操作(kind === 'action-line') */
  action?: ActionType
  /** 生命周期状态(kind === 'action-line';缺省 'armed') */
  status?: ActionStatus
  /** 触发方向(kind === 'action-line';缺省按 price vs 最新收盘推算) */
  direction?: ActionDirection
  /** 创建时的最新 bar 时间('YYYY-MM-DD'),用于「未来第一次到达」跨刷新判定;缺省退化为只看最新 K 线 */
  createdAt?: string
  /** 归属(缺省 'user');系统创建时显式 'system',用户只能修改/删除 user 对象 */
  source?: DrawingSource
}

/** 画线对象引用(菜单/删除/价格编辑操作入口) */
export interface DrawingRef {
  kind: DrawingKind
  id: number
  /** 被点中的控制点下标(0/1),供价格输入框定位;价格线无此字段 */
  point?: number
}
