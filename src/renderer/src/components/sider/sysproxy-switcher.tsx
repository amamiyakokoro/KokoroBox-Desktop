import { tr } from '../../../../shared/i18n'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { triggerSysProxy } from '@renderer/utils/ipc'
import { AiOutlineGlobal } from 'react-icons/ai'
import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { notify } from '@renderer/utils/notification'
import { SiderIconToggleButton, SiderQuickControl } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const SysproxySwitcher: React.FC<Props> = (props) => {
  const { iconOnly } = props
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    sysProxy,
    sysproxyCardStatus = 'col-span-1',
    onlyActiveDevice = false,
    disableAnimation = false
  } = appConfig || {}
  const { enable, mode } = sysProxy || {}
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { 'mixed-port': mixedPort } = controledMihomoConfig || {}
  const {
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: 'sysproxy'
  })

  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  const disabled = mixedPort == 0
  const selected = Boolean(!(mode !== 'auto' && disabled) && enable)
  const onChange = async (enable: boolean): Promise<void> => {
    if (mode == 'manual' && disabled) return
    try {
      await triggerSysProxy(enable, onlyActiveDevice)
      await patchAppConfig({ sysProxy: { enable } })
      window.electron.ipcRenderer.send('updateFloatingWindow')
      window.electron.ipcRenderer.send('updateTrayMenu')
    } catch (e) {
      notify(e, { variant: 'danger' })
    }
  }

  if (iconOnly) {
    return (
      <div className={`${sysproxyCardStatus} flex justify-center`}>
        <SiderIconToggleButton
          isDisabled={mode === 'manual' && disabled}
          isSelected={selected}
          label={`${tr('System proxy')} — ${selected ? tr('Enabled') : tr('Disabled')}`}
          placement="right"
          onChange={onChange}
        >
          <AiOutlineGlobal className="text-[20px]" />
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
      className={`${sysproxyCardStatus} sysproxy-card`}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        className={`${isDragging ? `${disableAnimation ? '' : 'scale-[0.98]'} tap-highlight-transparent` : ''}`}
      >
        <SiderQuickControl
          icon={<AiOutlineGlobal />}
          title={tr('System proxy')}
          status={selected ? tr('Enabled') : tr('Disabled')}
          enabled={selected}
          disabled={mode === 'manual' && disabled}
          isDragging={isDragging}
          onToggle={onChange}
        />
      </div>
    </div>
  )
}

export default SysproxySwitcher
