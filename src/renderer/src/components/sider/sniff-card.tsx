import { tr } from '../../../../shared/i18n'
import { RiScan2Fill } from 'react-icons/ri'
import { useLocation, useNavigate } from 'react-router-dom'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { Switch } from '@heroui/react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { restartCore } from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import React from 'react'
import { SiderIconButton, SiderQuickControl } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}
const settingsPath = '/settings?section=network&panel=sniffer'

const SniffCard: React.FC<Props> = (props) => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const { iconOnly } = props
  const {
    sniffCardStatus = 'col-span-1',
    controlSniff = true,
    disableAnimation = false
  } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match =
    location.pathname.includes('/sniffer') ||
    (location.pathname.includes('/settings') &&
      location.search.includes('section=network') &&
      location.search.includes('panel=sniffer'))
  const { patchControledMihomoConfig } = useControledMihomoConfig()
  const {
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: 'sniff'
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  const onChange = async (value: boolean): Promise<void> => {
    try {
      await patchAppConfig({ controlSniff: value })
      await patchControledMihomoConfig({})
      await restartCore()
    } catch (error) {
      notify(error, { variant: 'danger' })
    }
  }

  if (iconOnly) {
    return (
      <div className={`${sniffCardStatus} flex justify-center`}>
        <SiderIconButton
          active={match}
          label={tr('Sniffing')}
          placement="right"
          onPress={() => navigate(settingsPath)}
        >
          <RiScan2Fill className="text-[20px]" />
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
      className={`${sniffCardStatus} sniff-card`}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        className={isDragging && !disableAnimation ? 'scale-[0.98]' : undefined}
      >
        <SiderQuickControl
          icon={<RiScan2Fill />}
          title={tr('Sniffing')}
          status={controlSniff ? tr('Enabled') : tr('Disabled')}
          enabled={controlSniff}
          active={match}
          onPress={() => navigate(settingsPath)}
          control={
            <Switch
              size="sm"
              aria-label={tr('Sniffing')}
              isSelected={controlSniff}
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

export default SniffCard
