import { tr } from '../../../../shared/i18n'
import { Button, Card, CardBody, Input, Select, SelectItem, Switch, Tooltip } from '@heroui/react'
import { MdApps, MdArrowDownward, MdArrowUpward, MdDeleteOutline } from 'react-icons/md'

const actionLabels: Record<AppRoutingAction, string> = {
  proxy: 'Proxy',
  direct: 'Direct',
  block: 'Block'
}

const protocolLabels: Record<AppRoutingProtocol, string> = {
  tcp: 'TCP',
  udp: 'UDP',
  both: 'TCP + UDP'
}

interface AppRoutingRuleRowProps {
  rule: AppRoutingRule
  index: number
  count: number
  icon?: string
  disabled: boolean
  onChange: (patch: Partial<AppRoutingRule>) => void
  onMove: (offset: number) => void
  onDelete: () => void
}

export function AppRoutingRuleRow({
  rule,
  index,
  count,
  icon,
  disabled,
  onChange,
  onMove,
  onDelete
}: AppRoutingRuleRowProps): React.JSX.Element {
  return (
    <Card shadow="sm">
      <CardBody className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 gap-y-2 p-3.5">
        <div className="row-span-2 flex items-center justify-center self-stretch">
          {icon ? (
            <img src={icon} alt="" className="size-11 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-default-100 text-foreground-400">
              <MdApps className="text-2xl" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <Tooltip content={rule.processPattern} placement="top-start">
            <div className="min-w-0 flex-1">
              <Input
                key={rule.processPattern}
                aria-label={tr('程序匹配')}
                size="sm"
                variant="underlined"
                isDisabled={disabled}
                defaultValue={rule.processPattern}
                classNames={{
                  base: 'min-w-0',
                  input: 'truncate text-base font-semibold',
                  inputWrapper: 'min-h-9 h-9 px-0'
                }}
                onBlur={(event) => {
                  const processPattern = event.currentTarget.value.trim()
                  if (processPattern !== rule.processPattern) {
                    onChange({ processPattern })
                  }
                }}
              />
            </div>
          </Tooltip>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label={tr('上移')}
            isDisabled={index === 0 || disabled}
            onPress={() => onMove(-1)}
          >
            <MdArrowUpward />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label={tr('下移')}
            isDisabled={index === count - 1 || disabled}
            onPress={() => onMove(1)}
          >
            <MdArrowDownward />
          </Button>
          <Button
            isIconOnly
            size="sm"
            color="danger"
            variant="light"
            aria-label={tr('删除')}
            isDisabled={disabled}
            onPress={onDelete}
          >
            <MdDeleteOutline className="text-lg" />
          </Button>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-divider/70 pt-2">
          {rule.sourcePath && (
            <Tooltip content={rule.sourcePath} placement="bottom-start">
              <p className="min-w-28 flex-1 truncate text-xs text-foreground-500">
                {rule.sourcePath}
              </p>
            </Tooltip>
          )}
          <div className="flex items-center gap-1.5 text-xs text-foreground-500">
            <span>{tr('协议')}</span>
            <Select
              aria-label={tr('协议')}
              size="sm"
              className="w-32"
              isDisabled={disabled}
              selectedKeys={new Set([rule.protocol])}
              onSelectionChange={(keys) =>
                onChange({ protocol: keys.currentKey as AppRoutingProtocol })
              }
            >
              {Object.entries(protocolLabels).map(([key, label]) => (
                <SelectItem key={key}>{label}</SelectItem>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-foreground-500">
            <span>{tr('动作')}</span>
            <Select
              aria-label={tr('动作')}
              size="sm"
              className="w-28"
              isDisabled={disabled}
              selectedKeys={new Set([rule.action])}
              onSelectionChange={(keys) =>
                onChange({ action: keys.currentKey as AppRoutingAction })
              }
            >
              {Object.entries(actionLabels).map(([key, label]) => (
                <SelectItem key={key}>{label}</SelectItem>
              ))}
            </Select>
          </div>
          <Switch
            size="sm"
            aria-label={tr('启用规则')}
            isSelected={rule.enabled}
            isDisabled={disabled}
            onValueChange={(enabled) => onChange({ enabled })}
          />
        </div>
      </CardBody>
    </Card>
  )
}
