interface DrawToolbarProps {
  drawingEnabled: boolean
  fibonacciEnabled: boolean
  onToggleDrawing: () => void
  onToggleFibonacci: () => void
  onClear: () => void
}

/** 左侧竖向画线工具栏 */
export function DrawToolbar({
  drawingEnabled,
  fibonacciEnabled,
  onToggleDrawing,
  onToggleFibonacci,
  onClear,
}: DrawToolbarProps) {
  return (
    <div className="draw-toolbar-left">
      <span className="draw-toolbar-title">画线</span>
      <button
        className={drawingEnabled ? 'active' : ''}
        onClick={onToggleDrawing}
        title="价格线:开启后点击图表放置水平线"
      >
        ＝
      </button>
      <button
        className={fibonacciEnabled ? 'active fib' : 'fib'}
        onClick={onToggleFibonacci}
        title="斐波那契:开启后点击两点定义回调"
      >
        菲
      </button>
      <button onClick={onClear} title="清除全部画线">
        ×
      </button>
    </div>
  )
}
