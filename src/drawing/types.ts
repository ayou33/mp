/**
 * 画线子系统统一类型:
 * - 统一画线对象种类(DrawingKind)
 * - 统一存储格式(SerializedDrawing,可 JSON 化存储/回写)
 * - 统一操作引用(DrawingRef)
 */

/** 画线对象种类 */
export type DrawingKind = 'line' | 'fib' | 'price-line'

/** 两点画线类型:线段 / 射线 / 直线 */
export type LineType = 'segment' | 'ray' | 'straight'

/** 画线锚点(序列化载体;time 固定为 'YYYY-MM-DD' 字符串) */
export interface AnchorPoint {
  time: string
  price: number
}

/**
 * 统一存储格式:所有画线对象的序列化载体。
 * 可整体 JSON.stringify 后存 localStorage / 导出文件,再 restoreAll 回写重建。
 * 字段按 kind 分布:
 * - line:       lineType + p1 + p2
 * - fib:        p1 + p2
 * - price-line: price
 */
export interface SerializedDrawing {
  id: number
  kind: DrawingKind
  /** 线段类型(kind === 'line') */
  lineType?: LineType
  /** 锚点 1(kind === 'line' | 'fib') */
  p1?: AnchorPoint
  /** 锚点 2(kind === 'line' | 'fib') */
  p2?: AnchorPoint
  /** 价格(kind === 'price-line') */
  price?: number
  /** 只读标记 */
  readonly?: boolean
}

/** 画线对象引用(菜单/删除/只读/价格编辑操作入口) */
export interface DrawingRef {
  kind: DrawingKind
  id: number
  /** 被点中的控制点下标(0/1),供价格输入框定位;价格线无此字段 */
  point?: number
}
