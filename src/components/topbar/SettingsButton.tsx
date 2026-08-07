import SettingsIcon from '@iconify-react/material-symbols/settings'

interface SettingsButtonProps {
  onClick: () => void
}

/** 右侧全局设置图标按钮 */
export function SettingsButton({ onClick }: SettingsButtonProps) {
  return (
    <button
      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-muted hover:bg-white/5 hover:text-white"
      title="设置"
      onClick={onClick}
    >
      <SettingsIcon width="20" height="20" />
    </button>
  )
}
