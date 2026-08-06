import SettingsIcon from '@iconify-react/material-symbols-light/settings'

interface SettingsButtonProps {
  onClick: () => void
}

/** 右侧全局设置图标按钮 */
export function SettingsButton({ onClick }: SettingsButtonProps) {
  return (
    <button className="settings-button" title="设置" onClick={onClick}>
      <SettingsIcon width="20" height="20" />
    </button>
  )
}
