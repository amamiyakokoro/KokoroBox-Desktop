import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { LuServer } from 'react-icons/lu'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { restartCore } from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import React from 'react'
import { tr } from '../../../../shared/i18n'
import { SiderIconToggleButton, SiderQuickControl } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}
const DNSCard: React.FC<Props> = (props) => {
  const { appConfig, patchAppConfigOrThrow } = useAppConfig()
  const { iconOnly } = props
  const {
    dnsCardStatus = 'col-span-1',
    controlDns = true,
    disableAnimation = false
  } = appConfig || {}
  const { patchControledMihomoConfigOrThrow } = useControledMihomoConfig()
  const {
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: 'dns'
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  const onChange = async (value: boolean): Promise<void> => {
    try {
      await patchAppConfigOrThrow({ controlDns: value })
      await patchControledMihomoConfigOrThrow({})
      await restartCore()
    } catch (error) {
      notify(error, { variant: 'danger' })
    }
  }

  if (iconOnly) {
    return (
      <div className={`${dnsCardStatus} flex justify-center`}>
        <SiderIconToggleButton
          isSelected={controlDns}
          label={`DNS — ${controlDns ? tr('Enabled') : tr('Disabled')}`}
          placement="right"
          onChange={onChange}
        >
          <LuServer className="text-[20px]" />
        </SiderIconToggleButton>
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
      className={`${dnsCardStatus} dns-card`}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        className={isDragging && !disableAnimation ? 'scale-[0.98]' : undefined}
      >
        <SiderQuickControl
          icon={<LuServer />}
          title="DNS"
          status={controlDns ? tr('Enabled') : tr('Disabled')}
          enabled={controlDns}
          isDragging={isDragging}
          onToggle={onChange}
        />
      </div>
    </div>
  )
}

export default DNSCard
