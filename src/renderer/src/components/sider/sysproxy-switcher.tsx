import { tr } from '../../../../shared/i18n'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useSysProxyOperation } from '@renderer/hooks/use-sysproxy-operation'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { changeSysProxy } from '@renderer/utils/ipc'
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
  const { appConfig } = useAppConfig()
  const operation = useSysProxyOperation()
  const [optimisticPhase, setOptimisticPhase] = React.useState<'enabling' | 'disabling' | null>(
    null
  )
  React.useEffect(() => setOptimisticPhase(null), [operation.revision])
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
  const portUnavailable = mode === 'manual' && mixedPort == 0
  const phase = optimisticPhase ?? operation.phase
  const pending = phase === 'enabling' || phase === 'disabling'
  const selected = Boolean(operation.confirmed ?? (phase === 'idle' && enable))
  const disabled = portUnavailable && !selected && phase !== 'waiting-network'
  const status =
    phase === 'enabling'
      ? tr('Turning on…')
      : phase === 'disabling'
        ? tr('Turning off…')
        : phase === 'waiting-network'
          ? tr('Waiting for network…')
          : phase === 'unconfirmed'
            ? tr('Status unconfirmed')
            : selected
              ? tr('On')
              : tr('Off')
  const onChange = async (nextSelected: boolean): Promise<void> => {
    if (pending) return
    const nextEnable = phase === 'waiting-network' ? false : nextSelected
    if (nextEnable && portUnavailable) return
    setOptimisticPhase(nextEnable ? 'enabling' : 'disabling')
    try {
      await changeSysProxy(nextEnable, onlyActiveDevice)
      window.electron.ipcRenderer.send('updateFloatingWindow')
    } catch (e) {
      notify(e, { variant: 'danger' })
    } finally {
      setOptimisticPhase(null)
    }
  }

  if (iconOnly) {
    return (
      <div className={`${sysproxyCardStatus} flex justify-center`}>
        <SiderIconToggleButton
          isDisabled={disabled || pending}
          isSelected={selected}
          label={`${tr('System proxy')} — ${status}`}
          placement="right"
          onChange={onChange}
        >
          <AiOutlineGlobal className="text-[20px]" />
        </SiderIconToggleButton>
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {tr('System proxy')}: {status}
        </span>
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
          status={status}
          statusTitle={operation.error}
          enabled={selected}
          disabled={disabled}
          pending={pending}
          statusTone={phase === 'unconfirmed' ? 'warning' : selected ? 'success' : 'default'}
          isDragging={isDragging}
          onToggle={onChange}
        />
      </div>
    </div>
  )
}

export default SysproxySwitcher
