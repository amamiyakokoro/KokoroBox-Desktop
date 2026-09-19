import { tr } from '../../../../shared/i18n'
import { Tabs } from '@heroui/react'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { mihomoCloseConnections, patchMihomoConfig } from '@renderer/utils/ipc'

interface Props {
  iconOnly?: boolean
}

const OutboundModeSwitcher: React.FC<Props> = ({ iconOnly }: Props) => {
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { mutate: mutateGroups } = useGroups()
  const { appConfig } = useAppConfig()
  const { autoCloseConnection = true } = appConfig || {}
  const { mode } = controledMihomoConfig || {}

  const onChangeMode = async (mode: OutboundMode): Promise<void> => {
    await patchControledMihomoConfig({ mode })
    await patchMihomoConfig({ mode })
    if (autoCloseConnection) {
      await mihomoCloseConnections()
    }
    mutateGroups()
    window.electron.ipcRenderer.send('updateTrayMenu')
  }
  if (!mode) return null

  const options = [
    { id: 'rule', compactLabel: 'R', label: tr('Rules') },
    { id: 'global', compactLabel: 'G', label: tr('Global') },
    { id: 'direct', compactLabel: 'D', label: tr('Direct') }
  ] as const

  return (
    <Tabs
      aria-label={tr('Proxy mode')}
      className={iconOnly ? undefined : 'w-full'}
      orientation={iconOnly ? 'vertical' : 'horizontal'}
      selectedKey={mode}
      onSelectionChange={(key) => void onChangeMode(String(key) as OutboundMode)}
    >
      <Tabs.ListContainer className="outbound-mode-card bg-content1 shadow-sm">
        <Tabs.List aria-label={tr('Proxy mode')} className={iconOnly ? 'flex-col' : 'w-full'}>
          {options.map((option) => (
            <Tabs.Tab
              aria-label={option.label}
              className="data-[selected=true]:font-semibold data-[selected=true]:text-primary-foreground"
              id={option.id}
              key={option.id}
            >
              {iconOnly ? option.compactLabel : option.label}
              <Tabs.Indicator className="bg-primary shadow-none" />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  )
}

export default OutboundModeSwitcher
