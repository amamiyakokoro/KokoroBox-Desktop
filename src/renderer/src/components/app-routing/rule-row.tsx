import { tr } from '../../../../shared/i18n'
import { Button, Card, CardBody, Select, SelectItem, Switch } from '@heroui/react'
import { MdArrowDownward, MdArrowUpward, MdDeleteOutline } from 'react-icons/md'

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
      <CardBody className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_9rem_9rem_9rem] md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          {icon && <img src={icon} alt="" className="size-9 shrink-0 rounded-lg" />}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium" title={rule.processName}>
              {rule.displayName}
            </div>
            <div className="truncate text-xs text-foreground-500" title={rule.executablePath}>
              {rule.executablePath}
            </div>
          </div>
        </div>
        <Select
          aria-label={tr('协议')}
          size="sm"
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
        <Select
          aria-label={tr('动作')}
          size="sm"
          isDisabled={disabled}
          selectedKeys={new Set([rule.action])}
          onSelectionChange={(keys) => onChange({ action: keys.currentKey as AppRoutingAction })}
        >
          {Object.entries(actionLabels).map(([key, label]) => (
            <SelectItem key={key}>{label}</SelectItem>
          ))}
        </Select>
        <div className="flex shrink-0 items-center justify-end gap-1">
          <Switch
            size="sm"
            aria-label={tr('启用规则')}
            isSelected={rule.enabled}
            isDisabled={disabled}
            onValueChange={(enabled) => onChange({ enabled })}
          />
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
      </CardBody>
    </Card>
  )
}
