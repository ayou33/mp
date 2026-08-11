import type { ReactNode } from 'react'
import PolylineIcon from '@iconify-react/material-symbols/polyline'
import StarIcon from '@iconify-react/material-symbols/star'
import TuneIcon from '@iconify-react/material-symbols/tune'

/** 移动端可展开的面板:'none' = 全部收起 */
export type MobilePanel = 'none' | 'indicators' | 'draw' | 'watch'

const ITEMS: Array<{ key: Exclude<MobilePanel, 'none'>; label: string; icon: ReactNode }> = [
  { key: 'indicators', label: '指标', icon: <TuneIcon width="18" height="18" /> },
  { key: 'draw', label: '画线', icon: <PolylineIcon width="18" height="18" /> },
  { key: 'watch', label: '自选', icon: <StarIcon width="18" height="18" /> },
]

/**
 * 移动端底部操作栏(仅小屏 <lg 显示):指标 / 画线 / 自选 默认收起,点击展开对应浮层面板,再点关闭。
 * 桌面端(lg+)不渲染,对应面板常驻在图表两侧(见 App 布局)。
 */
export function MobileActionBar({ panel, onChange }: { panel: MobilePanel; onChange: (p: MobilePanel) => void }) {
  return (
    <div className="flex items-stretch justify-around border-t border-border bg-panel lg:hidden">
      {ITEMS.map((it) => (
        <button
          key={it.key}
          className={`flex flex-1 cursor-pointer flex-col items-center gap-0.5 border-none bg-transparent py-2 text-xs ${
            panel === it.key ? 'text-accent' : 'text-muted'
          }`}
          onClick={() => onChange(panel === it.key ? 'none' : it.key)}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  )
}
