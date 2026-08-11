import { MismatchDirection, type IChartApi, type ISeriesApi, type Time } from 'lightweight-charts'
import type { DrawingKind, DrawingRef, DrawingSource, SerializedDrawing } from './types'

/** 命中判定:鼠标距目标的最大像素距离 */
export const HIT_THRESHOLD = 8

/** 图表坐标点(交互解析结果) */
export interface Point {
  time: Time
  price: number
}

/** 容器内 CSS 坐标 */
export interface LocalPoint {
  x: number
  y: number
}

/**
 * 画线工具基类:统一事件路由与数据存取接口。
 *
 * 每种画线类型(价格线/线段/斐波那契)各自继承本类,实现
 * 放置/拖拽/命中/删除/价格编辑与序列化回写;
 * DrawingTools 按 kind 优先级统一路由事件,并把存取委托给各工具,
 * 因此上层只需面对一套统一接口(serializeAll/restoreAll)。
 */
export abstract class DrawingTool {
  readonly kind: DrawingKind
  protected readonly chart: IChartApi
  protected readonly series: ISeriesApi<'Candlestick'>
  protected readonly container: HTMLElement
  protected readonly _getBarCount: () => number
  /** 拖动结束后抑制下一次 click(避免拖动松手误放新画线) */
  private _suppressClick = false
  /** 数据变更回调(放置/拖拽结束/删除/编辑后触发,供上层持久化) */
  onChange?: () => void
  /** 画线模式激活状态(由各 setEnabled 维护;供 DrawingTools 判断右键取消画线等) */
  protected _enabled = false

  /** 通知上层画线数据已变更(放置/拖拽结束/删除/编辑后调用) */
  protected notifyChange(): void {
    this.onChange?.()
  }

  constructor(
    kind: DrawingKind,
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    container: HTMLElement,
    getBarCount: () => number,
  ) {
    this.kind = kind
    this.chart = chart
    this.series = series
    this.container = container
    this._getBarCount = getBarCount
  }

  // ---- 抽象数据接口(各工具实现) ----
  // 注意:setEnabled 不放在基类——各工具的启用状态参数语义不同
  // (price/fib 为 boolean,line 为 LineType | null),协调器按具体类型直接调用。

  /** 清除全部画线对象(注意就地变更数据源,见 CLAUDE.md 关键坑 2) */
  abstract clear(): void
  /** 清除全部用户画线对象(保留 system 对象),供用户「清除」操作 */
  abstract clearUser(): void
  /** 命中控制点(锚点/整条价格线) */
  abstract hitTestControls(x: number, y: number): DrawingRef | null
  /** 命中测试:控制点优先,再命中 body(线段 body/斐波那契连线);默认只测控制点 */
  hitTest(x: number, y: number): DrawingRef | null {
    return this.hitTestControls(x, y)
  }
  /** 序列化全部画线对象(统一存储格式) */
  abstract serialize(): SerializedDrawing[]
  /** 从统一存储格式回写重建 */
  abstract restore(items: SerializedDrawing[]): void
  /** 删除单个画线对象 */
  abstract delete(ref: DrawingRef): void
  /** 读取控制点价格(菜单输入框显示) */
  abstract getControlPointPrice(ref: DrawingRef): number | null
  /** 设置控制点价格 */
  abstract setControlPointPrice(ref: DrawingRef, price: number): void
  /** 查询对象归属(null 表示对象不存在) */
  abstract getSource(ref: DrawingRef): DrawingSource | null
  /** 系统创建画线对象(source='system',用户不可修改/删除) */
  abstract systemAdd(item: SerializedDrawing): void

  // ---- 事件钩子(由 DrawingTools 按优先级路由;onClick 返回 true 表示已消费) ----

  onClick?(pt: Point): boolean
  onCrosshairMove?(pt: Point): void
  /** 按下命中可拖拽对象时返回 true(阻止图表平移) */
  onPointerDown?(e: PointerEvent, local: LocalPoint): boolean
  onPointerMove?(e: PointerEvent, local: LocalPoint): void
  onPointerUp?(e: PointerEvent, local: LocalPoint): void
  /** 更新悬停高亮 */
  setHover?(ref: DrawingRef | null): void
  /** 析构 */
  dispose?(): void

  // ---- 公共辅助 ----

  /**
   * 用户视角是否可修改/删除:仅 user 对象(system 对象用户不可改)。
   * 权限在 DrawingTools 用户入口统一校验;工具底层方法不校验,供系统程序使用。
   */
  canUserModify(ref: DrawingRef): boolean {
    return this.getSource(ref) !== 'system'
  }

  /** 当前工具是否处于激活模式(画线模式开启) */
  isEnabled(): boolean {
    return this._enabled
  }

  /** 拖动结束后抑制下一次 click;由 DrawingTools 在 pointerup 检测到拖动时调用 */
  suppressNextClick(): void {
    this._suppressClick = true
  }

  /** 消费一次被抑制的 click;返回 true 表示本次 click 应被丢弃 */
  protected consumeSuppressedClick(): boolean {
    if (this._suppressClick) {
      this._suppressClick = false
      return true
    }
    return false
  }

  /** 拖动锚点:时间吸附到最近 K 线,价格跟随鼠标 */
  protected moveAnchor(anchor: { time: Time; price: number }, x: number, y: number): void {
    const logical = this.chart.timeScale().coordinateToLogical(x)
    const total = this._getBarCount()
    if (logical !== null && total > 0) {
      const idx = Math.max(0, Math.min(Math.round(logical), total - 1))
      const bar = this.series.dataByIndex(idx, MismatchDirection.NearestRight)
      if (bar && bar.time !== undefined) anchor.time = bar.time
    }
    const price = this.series.coordinateToPrice(y)
    if (price !== null) anchor.price = price
  }
}
