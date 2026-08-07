import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { DrawingTool, HIT_THRESHOLD, type LocalPoint, type Point } from './DrawingTool'
import {
  ActionPriceLinePrimitive,
  type ActionDataSource,
  type ActionLineItem,
} from './ActionPriceLinePrimitive'
import type { ActionDirection, ActionStatus, ActionType, DrawingRef, DrawingSource, SerializedDrawing } from './types'
import type { KlineBar } from '../types'

const VALID_ACTIONS: ActionType[] = ['open', 'add', 'reduce', 'close']
const VALID_STATUS: ActionStatus[] = ['armed', 'triggered', 'executed', 'violated']

/** 操作价格线方向:目标价 >= 最新收盘 → 向上触发,否则向下触发 */
function resolveDirection(price: number, lastClose?: number): ActionDirection {
  return lastClose !== undefined && price >= lastClose ? 'up' : 'down'
}

/**
 * 操作价格线工具:基于自绘 ActionPriceLinePrimitive 的水平价格线 + 生命周期状态机。
 * - 放置:激活模式下点击图表 → 通过 onRequestCreateAction 回调 React 层弹窗选操作类型
 * - 触发:checkTriggers 扫描自 createdAt 起的 K 线(high/low 覆盖跳空),armed → triggered
 * - 确认:setStatus 由 React 确认浮层调用,triggered → executed / violated(终态)
 * - 拖拽:仅 armed 且 user 可拖,拖拽结束重算方向并自检触发;triggered 后锁定几何
 * - 呼吸:triggered 时工具持有 setInterval 调 requestUpdate(不碰数据源,与就地变更不冲突)
 */
export class ActionPriceLineTool extends DrawingTool {
  readonly kind = 'action-line' as const
  private _primitive: ActionPriceLinePrimitive
  private _data: ActionDataSource = { items: [] }
  private _nextId = 1
  private _drag: ActionLineItem | null = null
  private _hoverId: number | null = null
  /** pointerdown 命中过本类线条:onClick 消费该次点击,不弹创建框 */
  private _pressHit = false
  private _getBars: () => KlineBar[]
  private _breathTimer: ReturnType<typeof setInterval> | null = null

  /** 激活模式点击图表时请求 React 层弹窗选操作类型(由 DrawingTools options 注入) */
  onRequestCreateAction: ((price: number) => void) | null = null

  constructor(
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    container: HTMLElement,
    getBarCount: () => number,
    getBars: () => KlineBar[],
    onRequestCreateAction: (price: number) => void,
  ) {
    super('action-line', chart, series, container, getBarCount)
    this._getBars = getBars
    this.onRequestCreateAction = onRequestCreateAction
    this._primitive = new ActionPriceLinePrimitive(this._data)
    series.attachPrimitive(this._primitive)
  }

  setEnabled(v: boolean): void {
    this._enabled = v
  }

  /** 用户创建(React 弹窗确认后调用):算方向 + 存 createdAt + armed 入列 */
  addAction(price: number, action: ActionType): void {
    const bars = this._getBars()
    const last = bars[bars.length - 1]
    this._data.items.push({
      id: this._nextId++,
      price,
      action,
      status: 'armed',
      direction: resolveDirection(price, last?.close),
      createdAt: last?.time,
    })
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  /** 确认执行交互:triggered → executed/violated(终态) */
  setStatus(id: number, status: ActionStatus): void {
    const item = this._data.items.find((i) => i.id === id)
    if (!item || item.status !== 'triggered') return
    item.status = status
    this._primitive.requestUpdate?.()
    this._syncBreathing()
    this.notifyChange()
  }

  /** 触发检测:自 createdAt 起扫描(缺失退化最新 bar),命中 armed → triggered */
  checkTriggers(bars: KlineBar[]): void {
    if (bars.length === 0) return
    let changed = false
    for (const item of this._data.items) {
      if (item.status !== 'armed') continue
      let hit = false
      if (item.createdAt) {
        const start = bars.findIndex((b) => b.time === item.createdAt)
        if (start >= 0) {
          for (let i = start; i < bars.length; i++) {
            if (item.direction === 'up' && bars[i].high >= item.price) {
              hit = true
              break
            }
            if (item.direction === 'down' && bars[i].low <= item.price) {
              hit = true
              break
            }
          }
        } else {
          const last = bars[bars.length - 1]
          hit = item.direction === 'up' ? last.high >= item.price : last.low <= item.price
        }
      } else {
        const last = bars[bars.length - 1]
        hit = item.direction === 'up' ? last.high >= item.price : last.low <= item.price
      }
      if (hit) {
        item.status = 'triggered'
        changed = true
      }
    }
    if (changed) {
      this._primitive.requestUpdate?.()
      this._syncBreathing()
      this.notifyChange()
    }
  }

  /** 供菜单判断能否改价:返回对象当前状态 */
  getActionStatus(ref: DrawingRef): ActionStatus | null {
    if (ref.kind !== 'action-line') return null
    return this._data.items.find((i) => i.id === ref.id)?.status ?? null
  }

  clear(): void {
    const d = this._data
    d.items = []
    d.highlight = null
    this._primitive.requestUpdate?.()
    this._syncBreathing()
  }

  clearUser(): void {
    const d = this._data
    d.items = d.items.filter((i) => i.source === 'system')
    d.highlight = null
    this._primitive.requestUpdate?.()
    this._syncBreathing()
  }

  getSource(ref: DrawingRef): DrawingSource | null {
    if (ref.kind !== 'action-line') return null
    return this._data.items.find((i) => i.id === ref.id)?.source ?? null
  }

  systemAdd(item: SerializedDrawing): void {
    if (item.kind !== 'action-line') return
    const price = item.price
    if (price === undefined || !Number.isFinite(price)) return
    const bars = this._getBars()
    const last = bars[bars.length - 1]
    this._data.items.push({
      id: this._nextId++,
      price,
      action: VALID_ACTIONS.includes(item.action as ActionType) ? (item.action as ActionType) : 'open',
      status: 'armed', // 系统创建强制 armed
      direction: item.direction ?? resolveDirection(price, last?.close),
      createdAt: item.createdAt ?? last?.time,
      source: 'system',
    })
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  hitTestControls(_x: number, y: number): DrawingRef | null {
    for (const item of this._data.items) {
      const cy = this.series.priceToCoordinate(item.price)
      if (cy !== null && Math.abs(cy - y) <= HIT_THRESHOLD) {
        return { kind: 'action-line', id: item.id }
      }
    }
    return null
  }

  setHover(ref: DrawingRef | null): void {
    const id = ref?.kind === 'action-line' ? ref.id : null
    if (id === this._hoverId) return
    this._hoverId = id
    this._data.highlight = id
    this._primitive.requestUpdate?.()
  }

  onClick(pt: Point): boolean {
    const pressHit = this._pressHit
    this._pressHit = false
    if (!this._enabled) return false
    // 拖拽松手后的那次 click 不重复弹创建框
    if (this.consumeSuppressedClick()) return true
    // 点击的是已有线条(命中了控制点):不弹创建框
    if (pressHit) return true
    this.onRequestCreateAction?.(pt.price)
    return true
  }

  onPointerDown(_e: PointerEvent, local: LocalPoint): boolean {
    for (const item of this._data.items) {
      const cy = this.series.priceToCoordinate(item.price)
      if (cy !== null && Math.abs(cy - local.y) <= HIT_THRESHOLD) {
        this._pressHit = true
        // 仅 armed 且 user 可拖;其余命中仍消费(阻止图表平移 + 弹左键菜单)
        if (item.source !== 'system' && item.status === 'armed') {
          this._drag = item
        }
        return true
      }
    }
    return false
  }

  onPointerMove(_e: PointerEvent, local: LocalPoint): void {
    const pl = this._drag
    if (!pl) return
    const price = this.series.coordinateToPrice(local.y)
    if (price !== null) {
      pl.price = price
      this._primitive.requestUpdate?.()
    }
  }

  onPointerUp(): void {
    const drag = this._drag
    if (!drag) return
    this._drag = null
    const bars = this._getBars()
    // 拖拽结束:重算触发方向(目标价已变)+ 自检触发
    if (drag.status === 'armed' && bars.length > 0) {
      drag.direction = resolveDirection(drag.price, bars[bars.length - 1].close)
    }
    this.checkTriggers(bars)
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  delete(ref: DrawingRef): void {
    if (ref.kind !== 'action-line') return
    const idx = this._data.items.findIndex((i) => i.id === ref.id)
    if (idx >= 0) {
      this._data.items.splice(idx, 1)
      this._primitive.requestUpdate?.()
      this._syncBreathing()
      this.notifyChange()
    }
  }

  getControlPointPrice(ref: DrawingRef): number | null {
    if (ref.kind !== 'action-line') return null
    return this._data.items.find((i) => i.id === ref.id)?.price ?? null
  }

  /** 菜单改价:仅 armed 生效(触发后锁定几何),改价后重算方向 */
  setControlPointPrice(ref: DrawingRef, price: number): void {
    if (ref.kind !== 'action-line' || !Number.isFinite(price)) return
    const item = this._data.items.find((i) => i.id === ref.id)
    if (!item || item.status !== 'armed') return
    item.price = price
    const bars = this._getBars()
    if (bars.length > 0) {
      item.direction = resolveDirection(item.price, bars[bars.length - 1].close)
    }
    this._primitive.requestUpdate?.()
    this.notifyChange()
  }

  serialize(): SerializedDrawing[] {
    return this._data.items.map((i) => ({
      id: i.id,
      kind: 'action-line',
      price: i.price,
      action: i.action,
      status: i.status,
      direction: i.direction,
      createdAt: i.createdAt,
      source: i.source === 'system' ? 'system' : undefined,
    }))
  }

  restore(items: SerializedDrawing[]): void {
    const d = this._data
    d.items = []
    d.highlight = null
    for (const s of items) {
      if (s.kind !== 'action-line') continue
      const price = s.price
      if (price === undefined || !Number.isFinite(price)) continue
      const bars = this._getBars()
      const last = bars[bars.length - 1]
      d.items.push({
        id: s.id,
        price,
        action: VALID_ACTIONS.includes(s.action as ActionType) ? (s.action as ActionType) : 'open',
        status: VALID_STATUS.includes(s.status as ActionStatus) ? (s.status as ActionStatus) : 'armed',
        direction: s.direction === 'down' ? 'down' : resolveDirection(price, last?.close),
        createdAt: s.createdAt,
        source: s.source,
      })
      this._nextId = Math.max(this._nextId, s.id + 1)
    }
    this._primitive.requestUpdate?.()
    this._syncBreathing()
  }

  dispose(): void {
    if (this._breathTimer !== null) {
      clearInterval(this._breathTimer)
      this._breathTimer = null
    }
  }

  /** 呼吸动画启停:有 triggered 则定时刷新,否则停止(定时器只调 requestUpdate,不碰数据源) */
  private _syncBreathing(): void {
    const anyTriggered = this._data.items.some((i) => i.status === 'triggered')
    if (anyTriggered && this._breathTimer === null) {
      this._breathTimer = setInterval(() => this._primitive.requestUpdate?.(), 33)
    } else if (!anyTriggered && this._breathTimer !== null) {
      clearInterval(this._breathTimer)
      this._breathTimer = null
    }
  }
}
