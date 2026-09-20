import { tr } from '../../../../shared/i18n'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { Switch } from '@heroui/react'
import { TbDeviceIpadHorizontalBolt } from 'react-icons/tb'
import { useLocation, useNavigate } from 'react-router-dom'
import { restartCore } from '@renderer/utils/ipc'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import React from 'react'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { SiderIconButton, SiderQuickControl } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const settingsPath = '/settings?section=network&panel=tun'

const TunSwitcher: React.FC<Props> = (props) => {
  const { iconOnly } = props
  const location = useLocation()
  const navigate = useNavigate()
  const match =
    location.pathname.includes('/tun') ||
    (location.pathname.includes('/settings') && location.search.includes('panel=tun'))
  const { appConfig } = useAppConfig()
  const { tunCardStatus = 'col-span-1', disableAnimation = false } = appConfig || {}
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { tun } = controledMihomoConfig || {}
  const { enable } = tun || {}
  const {
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: 'tun'
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  const onChange = async (enable: boolean): Promise<void> => {
    if (enable) {
      await patchControledMihomoConfig({ tun: { enable }, dns: { enable: true } })
    } else {
      await patchControledMihomoConfig({ tun: { enable } })
    }
    await restartCore()
    window.electron.ipcRenderer.send('updateFloatingWindow')
    window.electron.ipcRenderer.send('updateTrayMenu')
  }

  if (iconOnly) {
    return (
      <div className={`${tunCardStatus} flex justify-center`}>
        <SiderIconButton
          active={match}
          label={tr('TUN mode')}
          placement="right"
          onPress={() => navigate(settingsPath)}
        >
          <TbDeviceIpadHorizontalBolt className="text-[20px]" />
        </SiderIconButton>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined
      }}
      className={`${tunCardStatus} tun-card`}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        className={`${isDragging ? `${disableAnimation ? '' : 'scale-[0.98]'} tap-highlight-transparent` : ''}`}
      >
        <SiderQuickControl
          icon={<TbDeviceIpadHorizontalBolt />}
          title={tr('TUN mode')}
          status={enable ? tr('Enabled') : tr('Disabled')}
          enabled={Boolean(enable)}
          active={match}
          onPress={() => navigate(settingsPath)}
          control={
            <Switch
              size="sm"
              aria-label={tr('TUN mode')}
              isSelected={enable}
              onChange={onChange}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          }
        />
      </div>
    </div>
  )
}

export default TunSwitcher
