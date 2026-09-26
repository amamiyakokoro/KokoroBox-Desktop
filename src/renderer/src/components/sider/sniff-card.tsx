import { tr } from '../../../../shared/i18n'
import { RiScan2Fill } from 'react-icons/ri'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { restartCore } from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import React from 'react'
import { SiderIconToggleButton, SiderQuickControl } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}
const SniffCard: React.FC<Props> = (props) => {
  const { appConfig, patchAppConfigOrThrow } = useAppConfig()
  const { iconOnly } = props
  const {
    sniffCardStatus = 'col-span-1',
    controlSniff = true,
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
    id: 'sniff'
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  const onChange = async (value: boolean): Promise<void> => {
    try {
      await patchAppConfigOrThrow({ controlSniff: value })
      await patchControledMihomoConfigOrThrow({})
      await restartCore()
    } catch (error) {
      notify(error, { variant: 'danger' })
    }
  }

  if (iconOnly) {
    return (
      <div className={`${sniffCardStatus} flex justify-center`}>
        <SiderIconToggleButton
          isSelected={controlSniff}
          label={`${tr('Sniffing')} — ${controlSniff ? tr('Enabled') : tr('Disabled')}`}
          placement="right"
          onChange={onChange}
        >
          <RiScan2Fill className="text-[20px]" />
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
          isDragging={isDragging}
          onToggle={onChange}
        />
      </div>
    </div>
  )
}

export default SniffCard
