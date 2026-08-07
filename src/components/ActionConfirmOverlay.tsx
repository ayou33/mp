import type { ActionType } from '../drawing/DrawingTools'
import { ACTION_LABELS } from '../drawing/ActionPriceLinePrimitive'
import { BaseModal } from './modal/BaseModal'

interface ActionConfirmOverlayProps {
  /** 期望操作类型(浮层上显示) */
  action: ActionType
  /** 浮层中心 x(容器内 CSS px) */
  x: number
  /** 价格线 y(series.priceToCoordinate 结果) */
  y: number
  /** true=已执行 / false=未执行 */
  onConfirm: (executed: boolean) => void
}

/** triggered 操作价格线的执行确认浮层:在价格线中心上方显示「已执行/未执行」按钮(基于 BaseModal float) */
export function ActionConfirmOverlay({ action, x, y, onConfirm }: ActionConfirmOverlayProps) {
  return (
    <BaseModal placement="float" x={x} y={y} className="action-confirm">
      <span className="text-xs text-ink">{ACTION_LABELS[action]}</span>
      <button
        className="cursor-pointer rounded-[4px] border border-down bg-transparent px-2.5 py-1 text-xs text-down"
        onClick={() => onConfirm(true)}
      >
        已执行
      </button>
      <button
        className="cursor-pointer rounded-[4px] border border-up bg-transparent px-2.5 py-1 text-xs text-up"
        onClick={() => onConfirm(false)}
      >
        未执行
      </button>
    </BaseModal>
  )
}
