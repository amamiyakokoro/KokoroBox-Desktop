import { tr } from '../../../../shared/i18n'
import { Button, Card, CardBody, Input, Select, SelectItem, Switch, Tooltip } from '@heroui/react'
import { MdArrowDownward, MdArrowUpward, MdDeleteOutline } from 'react-icons/md'
import defaultApplicationIcon from '../../../../../resources/app-routing-default-icon.svg?url'
import { appRoutingExecutableName } from '../../../../shared/app-routing'

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
  const isMacRule =
    rule.identifierKind === 'macos-process-name' ||
    rule.identifierKind === 'macos-signing-identifier'
  const isLinuxRule =
    rule.identifierKind === 'linux-executable' || rule.identifierKind === 'linux-process-name'
  const hasIdentifierKindSelector = isMacRule || isLinuxRule
  const changeIdentifierKind = (identifierKind: AppRoutingIdentifierKind): void => {
    if (identifierKind === 'linux-process-name') {
      onChange({
        identifierKind,
        processPattern: appRoutingExecutableName(rule.processPattern, 'linux-executable'),
        sourcePath: rule.sourcePath ?? rule.processPattern
      })
      return
    }
    if (identifierKind === 'linux-executable') {
      if (rule.sourcePath) onChange({ identifierKind, processPattern: rule.sourcePath })
      return
    }
    onChange({
      identifierKind,
      ...(identifierKind === 'macos-process-name' ? { sourcePath: undefined } : {})
    })
  }
  return (
    <Card shadow="sm">
      <CardBody className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 gap-y-2 p-3.5">
        <div className="row-span-2 flex items-center justify-center self-stretch">
          <img
            src={icon || defaultApplicationIcon}
            alt=""
            className="size-11 shrink-0 rounded-xl object-contain"
            onError={(event) => {
              event.currentTarget.onerror = null
              event.currentTarget.src = defaultApplicationIcon
            }}
          />
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <Tooltip
            content={
              <div className="max-w-sm break-all">
                {rule.processPattern}
                {rule.sourcePath && <p className="mt-1 text-xs">{rule.sourcePath}</p>}
              </div>
            }
            placement="top-start"
          >
            <div className="min-w-0 flex-1">
              <Input
                key={rule.processPattern}
                aria-label={tr('程序匹配')}
                size="sm"
                variant="flat"
                isDisabled={disabled}
                defaultValue={rule.processPattern}
                classNames={{
                  base: 'min-w-0',
                  input: 'truncate text-base font-semibold',
                  inputWrapper: 'min-h-9 h-9 px-1 bg-transparent shadow-none'
                }}
                onBlur={(event) => {
                  const processPattern = event.currentTarget.value.trim()
                  if (processPattern !== rule.processPattern) {
                    onChange({
                      processPattern,
                      ...(rule.identifierKind === 'linux-executable'
                        ? { sourcePath: processPattern }
                        : {})
                    })
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
        <div
          className={`grid min-w-0 items-center gap-2 ${
            hasIdentifierKindSelector
              ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
              : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'
          }`}
        >
          {hasIdentifierKindSelector && (
            <div className="min-w-0">
              {isMacRule ? (
                <Select
                  aria-label={tr('匹配方式')}
                  size="sm"
                  className="w-full min-w-0"
                  disallowEmptySelection
                  isDisabled={disabled}
                  selectedKeys={new Set([rule.identifierKind!])}
                  onSelectionChange={(keys) =>
                    changeIdentifierKind(keys.currentKey as AppRoutingIdentifierKind)
                  }
                >
                  <SelectItem key="macos-process-name">{tr('进程名称')}</SelectItem>
                  <SelectItem key="macos-signing-identifier">{tr('签名标识')}</SelectItem>
                </Select>
              ) : (
                <Select
                  aria-label={tr('匹配方式')}
                  size="sm"
                  className="w-full min-w-0"
                  disallowEmptySelection
                  isDisabled={disabled}
                  selectedKeys={new Set([rule.identifierKind!])}
                  onSelectionChange={(keys) =>
                    changeIdentifierKind(keys.currentKey as AppRoutingIdentifierKind)
                  }
                >
                  <SelectItem key="linux-executable" isDisabled={!rule.sourcePath}>
                    {tr('可执行文件路径')}
                  </SelectItem>
                  <SelectItem key="linux-process-name">{tr('进程名称')}</SelectItem>
                </Select>
              )}
            </div>
          )}
          <div className="min-w-0">
            <Select
              aria-label={tr('协议')}
              size="sm"
              className="w-full min-w-0"
              disallowEmptySelection
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
          <div className="min-w-0">
            <Select
              aria-label={tr('动作')}
              size="sm"
              className="w-full min-w-0"
              disallowEmptySelection
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
