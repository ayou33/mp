import type { ReactNode } from 'react'
import AdsClickIcon from '@iconify-react/material-symbols/ads-click'
import DataThresholdingIcon from '@iconify-react/material-symbols/data-thresholding'
import DeleteIcon from '@iconify-react/material-symbols/delete'
import EastIcon from '@iconify-react/material-symbols/east'
import HorizontalRuleIcon from '@iconify-react/material-symbols/horizontal-rule'
import LinearScaleIcon from '@iconify-react/material-symbols/linear-scale'
import NotesIcon from '@iconify-react/material-symbols/notes'
import PolylineIcon from '@iconify-react/material-symbols/polyline'
import RectangleIcon from '@iconify-react/material-symbols/rectangle'
import SquareFootIcon from '@iconify-react/material-symbols/square-foot'
import StraightenIcon from '@iconify-react/material-symbols/straighten'
import TrendingDownIcon from '@iconify-react/material-symbols/trending-down'
import TrendingUpIcon from '@iconify-react/material-symbols/trending-up'
import VerticalAlignCenterIcon from '@iconify-react/material-symbols/vertical-align-center'
import type { LineType } from '../drawing/LinePrimitive'

interface DrawToolbarProps {
  drawingEnabled: boolean
  fibonacciEnabled: boolean
  /** 当前激活的画线工具(线段/射线/直线),null 表示未激活 */
  lineTool: LineType | null
  /** 操作价格线模式 */
  actionEnabled: boolean
  /** 矩形模式 */
  rectEnabled: boolean
  /** 测量模式 */
  measureEnabled: boolean
  /** 斐波那契扩展模式 */
  fibExtEnabled: boolean
  /** 垂直线模式 */
  verticalEnabled: boolean
  /** 文本标注模式 */
  textEnabled: boolean
  onToggleDrawing: () => void
  onToggleFibonacci: () => void
  onLineTool: (type: LineType | null) => void
  onToggleAction: () => void
  onToggleRect: () => void
  onToggleMeasure: () => void
  onToggleFibExt: () => void
  onToggleVertical: () => void
  onToggleText: () => void
  onClear: () => void
  /** 测试:模拟行情向上跳动(追加大涨 K 线,触发操作价格线) */
  onSimulateUp: () => void
  /** 测试:模拟行情向下跳动(追加大跌 K 线,触发操作价格线) */
  onSimulateDown: () => void
}

/** 左侧竖向画线工具栏 */
export function DrawToolbar({
  drawingEnabled,
  fibonacciEnabled,
  lineTool,
  actionEnabled,
  rectEnabled,
  measureEnabled,
  fibExtEnabled,
  verticalEnabled,
  textEnabled,
  onToggleDrawing,
  onToggleFibonacci,
  onLineTool,
  onToggleAction,
  onToggleRect,
  onToggleMeasure,
  onToggleFibExt,
  onToggleVertical,
  onToggleText,
  onClear,
  onSimulateUp,
  onSimulateDown,
}: DrawToolbarProps) {
  const lineBtns: Array<{ type: LineType; icon: ReactNode; title: string }> = [
    { type: 'straight', icon: <LinearScaleIcon width="20" height="20" />, title: '趋势线:两点直线' },
    { type: 'ray', icon: <EastIcon width="20" height="20" />, title: '射线:起点向右延伸' },
    { type: 'segment', icon: <StraightenIcon width="20" height="20" />, title: '线段:两点间' },
  ]

  const baseBtn =
    'flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-ink hover:bg-white/5'
  const act = (color: string) => `bg-${color}/20 text-${color}`
  return (
    <div className="flex flex-none flex-col items-center gap-2 rounded-tr-lg bg-panel px-1.5 py-2.5">
      <span className="mb-0.5 text-xs text-muted">画线</span>
      <button
        className={`${baseBtn} ${drawingEnabled ? act('yellow') : ''}`}
        onClick={onToggleDrawing}
        title="价格线:开启后点击图表放置水平线"
      >
        <HorizontalRuleIcon width="20" height="20" />
      </button>
      {lineBtns.map((b) => (
        <button
          key={b.type}
          className={`${baseBtn} ${lineTool === b.type ? act('yellow') : ''}`}
          onClick={() => onLineTool(lineTool === b.type ? null : b.type)}
          title={b.title}
        >
          {b.icon}
        </button>
      ))}
      <button
        className={`${baseBtn} ${rectEnabled ? act('cyan') : ''}`}
        onClick={onToggleRect}
        title="矩形:开启后点击两点定义对角(支撑/压力区间)"
      >
        <RectangleIcon width="20" height="20" />
      </button>
      <button
        className={`${baseBtn} ${measureEnabled ? act('cyan') : ''}`}
        onClick={onToggleMeasure}
        title="测量:开启后点击两点显示价差/涨跌幅/根数"
      >
        <SquareFootIcon width="20" height="20" />
      </button>
      <button
        className={`${baseBtn} ${fibonacciEnabled ? act('purple') : ''}`}
        onClick={onToggleFibonacci}
        title="斐波那契:开启后点击两点定义回调"
      >
        <DataThresholdingIcon width="20" height="20" />
      </button>
      <button
        className={`${baseBtn} ${fibExtEnabled ? act('purple') : ''}`}
        onClick={onToggleFibExt}
        title="斐波那契扩展:开启后点击三点定义 A/B/C 预测目标位"
      >
        <PolylineIcon width="20" height="20" />
      </button>
      <button
        className={`${baseBtn} ${verticalEnabled ? act('ink') : ''}`}
        onClick={onToggleVertical}
        title="垂直线:开启后点击图表标记关键日期"
      >
        <VerticalAlignCenterIcon width="20" height="20" />
      </button>
      <button
        className={`${baseBtn} ${textEnabled ? act('accent') : ''}`}
        onClick={onToggleText}
        title="文本标注:开启后点击图表输入文本"
      >
        <NotesIcon width="20" height="20" />
      </button>
      <button
        className={`${baseBtn} ${actionEnabled ? act('accent') : ''}`}
        onClick={onToggleAction}
        title="操作价格线:开启后点击图表选择操作类型"
      >
        <AdsClickIcon width="20" height="20" />
      </button>
      <button className={baseBtn} onClick={onClear} title="清除全部画线">
        <DeleteIcon width="20" height="20" />
      </button>
      {/* 测试:模拟行情跳动,驱动操作价格线触发检测 */}
      <div className="mt-1 flex flex-col items-center gap-2 border-t border-border pt-2">
        <span className="text-[10px] leading-none text-muted">模拟</span>
        <button
          className={baseBtn}
          onClick={onSimulateUp}
          title="测试:模拟行情向上跳动(追加大涨 K 线,触发操作价格线)"
        >
          <TrendingUpIcon width="20" height="20" />
        </button>
        <button
          className={baseBtn}
          onClick={onSimulateDown}
          title="测试:模拟行情向下跳动(追加大跌 K 线,触发操作价格线)"
        >
          <TrendingDownIcon width="20" height="20" />
        </button>
      </div>
    </div>
  )
}
