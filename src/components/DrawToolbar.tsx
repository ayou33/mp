import type { ReactNode } from 'react'
import DataThresholdingIcon from '@iconify-react/material-symbols-light/data-thresholding'
import DeleteIcon from '@iconify-react/material-symbols-light/delete'
import EastIcon from '@iconify-react/material-symbols-light/east'
import HorizontalRuleIcon from '@iconify-react/material-symbols-light/horizontal-rule'
import LinearScaleIcon from '@iconify-react/material-symbols-light/linear-scale'
import StraightenIcon from '@iconify-react/material-symbols-light/straighten'
import type { LineType } from '../drawing/LinePrimitive'

interface DrawToolbarProps {
  drawingEnabled: boolean
  fibonacciEnabled: boolean
  /** 当前激活的画线工具(线段/射线/直线),null 表示未激活 */
  lineTool: LineType | null
  onToggleDrawing: () => void
  onToggleFibonacci: () => void
  onLineTool: (type: LineType | null) => void
  onClear: () => void
}

/** 左侧竖向画线工具栏 */
export function DrawToolbar({
  drawingEnabled,
  fibonacciEnabled,
  lineTool,
  onToggleDrawing,
  onToggleFibonacci,
  onLineTool,
  onClear,
}: DrawToolbarProps) {
  const lineBtns: Array<{ type: LineType; icon: ReactNode; title: string }> = [
    { type: 'straight', icon: <LinearScaleIcon width="20" height="20" />, title: '趋势线:两点直线' },
    { type: 'ray', icon: <EastIcon width="20" height="20" />, title: '射线:起点向右延伸' },
    { type: 'segment', icon: <StraightenIcon width="20" height="20" />, title: '线段:两点间' },
  ]

  return (
    <div className="draw-toolbar-left">
      <span className="draw-toolbar-title">画线</span>
      <button
        className={drawingEnabled ? 'active' : ''}
        onClick={onToggleDrawing}
        title="价格线:开启后点击图表放置水平线"
      >
        <HorizontalRuleIcon width="20" height="20" />
      </button>
      {lineBtns.map((b) => (
        <button
          key={b.type}
          className={lineTool === b.type ? 'active' : ''}
          onClick={() => onLineTool(lineTool === b.type ? null : b.type)}
          title={b.title}
        >
          {b.icon}
        </button>
      ))}
      <button
        className={fibonacciEnabled ? 'active fib' : 'fib'}
        onClick={onToggleFibonacci}
        title="斐波那契:开启后点击两点定义回调"
      >
        <DataThresholdingIcon width="20" height="20" />
      </button>
      <button onClick={onClear} title="清除全部画线">
        <DeleteIcon width="20" height="20" />
      </button>
    </div>
  )
}
