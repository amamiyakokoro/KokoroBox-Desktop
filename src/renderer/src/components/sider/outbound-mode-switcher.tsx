import { tr } from '../../../../shared/i18n'
import { Button, Dropdown, Label, Tabs } from '@heroui/react'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { mihomoCloseConnections, patchMihomoConfig } from '@renderer/utils/ipc'
import { LuArrowRight, LuGlobe, LuRoute } from 'react-icons/lu'

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
    { id: 'rule', icon: <LuRoute />, label: tr('Rules') },
    { id: 'global', icon: <LuGlobe />, label: tr('Global') },
    { id: 'direct', icon: <LuArrowRight />, label: tr('Direct') }
  ] as const
  const currentOption = options.find((option) => option.id === mode) ?? options[0]
  const currentModeLabel = `${tr('Proxy mode')}: ${currentOption.label}`

  if (iconOnly) {
    return (
      <Dropdown>
        <Button
          ref={(element) => {
            if (element) element.title = currentModeLabel
          }}
          aria-label={currentModeLabel}
          className="app-nodrag"
          isIconOnly
          size="sm"
          variant="primary"
        >
          <span aria-hidden="true" className="text-lg">
            {currentOption.icon}
          </span>
        </Button>
        <Dropdown.Popover placement="right bottom">
          <Dropdown.Menu
            aria-label={tr('Proxy mode')}
            disallowEmptySelection
            selectedKeys={new Set([mode])}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const key = keys === 'all' ? undefined : keys.values().next().value
              if (key !== undefined && key !== mode) {
                void onChangeMode(String(key) as OutboundMode)
              }
            }}
          >
            {options.map((option) => (
              <Dropdown.Item id={option.id} key={option.id} textValue={option.label}>
                <span aria-hidden="true" className="shrink-0 text-muted [&>svg]:size-4">
                  {option.icon}
                </span>
                <Label className="min-w-0 flex-1">{option.label}</Label>
                <Dropdown.ItemIndicator />
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    )
  }

  return (
    <Tabs
      aria-label={tr('Proxy mode')}
      className="w-full"
      orientation="horizontal"
      selectedKey={mode}
      onSelectionChange={(key) => void onChangeMode(String(key) as OutboundMode)}
    >
      <Tabs.ListContainer className="outbound-mode-card border border-separator/60 bg-surface-secondary/80 shadow-sm">
        <Tabs.List aria-label={tr('Proxy mode')} className="w-full">
          {options.map((option) => (
            <Tabs.Tab
              aria-label={option.label}
              className="text-muted transition-colors hover:text-foreground data-[selected=true]:font-semibold data-[selected=true]:text-accent-soft-foreground data-[selected=false]:hover:bg-accent-soft/25"
              id={option.id}
              key={option.id}
            >
              {option.label}
              <Tabs.Indicator className="border border-accent/25 bg-accent-soft/60 shadow-none ring-1 ring-inset ring-accent/10" />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  )
}

export default OutboundModeSwitcher
