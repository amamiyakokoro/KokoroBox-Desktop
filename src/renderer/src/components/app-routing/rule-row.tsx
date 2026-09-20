import { tr } from '../../../../shared/i18n'
import { Card, InputGroup, Switch } from '@heroui/react'
import { KokoActionMenu } from '../base/koko-collections'
import { KokoSelect } from '../base/koko-form'
import {
  MdArrowDownward,
  MdArrowUpward,
  MdDeleteOutline,
  MdEdit,
  MdMoreHoriz
} from 'react-icons/md'
import defaultApplicationIcon from '../../../../../resources/app-routing-default-icon.svg?url'
import { appRoutingExecutableName } from '../../../../shared/app-routing'
import { useState } from 'react'

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

const actionDotClass: Record<AppRoutingAction, string> = {
  proxy: 'bg-accent',
  direct: 'bg-success',
  block: 'bg-danger'
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
  const [isEditingPattern, setIsEditingPattern] = useState(false)
  const isMacRule =
    rule.identifierKind === 'macos-process-name' ||
    rule.identifierKind === 'macos-signing-identifier'
  const isLinuxRule =
    rule.identifierKind === 'linux-executable' || rule.identifierKind === 'linux-process-name'
  const hasIdentifierKindSelector = isMacRule || isLinuxRule
  const identifierLabel =
    rule.identifierKind === 'macos-signing-identifier'
      ? tr('Signing identifier')
      : rule.identifierKind === 'linux-executable'
        ? tr('Executable path')
        : rule.identifierKind === 'macos-process-name' ||
            rule.identifierKind === 'linux-process-name'
          ? tr('Process name')
          : tr('Process pattern')
  const actionOptions = Object.entries(actionLabels).map(([id, label]) => ({
    id,
    textValue: label,
    label: (
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={`size-1.5 shrink-0 rounded-full ${actionDotClass[id as AppRoutingAction]}`}
        />
        <span className="truncate">{label}</span>
      </span>
    )
  }))
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
    <Card className="app-routing-rule-card p-3" data-enabled={rule.enabled}>
      <Card.Content className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 gap-y-2">
        <div className="row-span-2 flex size-11 items-center justify-center self-start overflow-hidden rounded-xl bg-surface-secondary p-1">
          <img
            src={icon || defaultApplicationIcon}
            alt=""
            className="size-full shrink-0 rounded-lg object-contain"
            onError={(event) => {
              event.currentTarget.onerror = null
              event.currentTarget.src = defaultApplicationIcon
            }}
          />
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <div
            className="min-w-0 flex-1"
            title={
              rule.sourcePath ? `${rule.processPattern}\n${rule.sourcePath}` : rule.processPattern
            }
          >
            {isEditingPattern ? (
              <InputGroup variant="secondary" className="min-h-9 min-w-0">
                <InputGroup.Input
                  key={rule.processPattern}
                  autoFocus
                  aria-label={tr('Process pattern')}
                  disabled={disabled}
                  defaultValue={rule.processPattern}
                  className="cursor-text truncate text-base font-semibold"
                  onBlur={(event) => {
                    const processPattern = event.currentTarget.value.trim()
                    if (processPattern && processPattern !== rule.processPattern) {
                      onChange({
                        processPattern,
                        ...(rule.identifierKind === 'linux-executable'
                          ? { sourcePath: processPattern }
                          : {})
                      })
                    }
                    setIsEditingPattern(false)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                      event.currentTarget.value = rule.processPattern
                      event.currentTarget.blur()
                    }
                  }}
                />
              </InputGroup>
            ) : (
              <button
                type="button"
                className="group/title flex max-w-full min-w-0 items-center gap-1.5 rounded-md text-left outline-none"
                disabled={disabled}
                title={tr('Edit')}
                onClick={() => setIsEditingPattern(true)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold leading-5 text-foreground">
                    {rule.processPattern}
                  </span>
                  <span className="block truncate text-xs leading-4 text-muted">
                    {identifierLabel}
                  </span>
                </span>
                <MdEdit
                  aria-hidden="true"
                  className="shrink-0 text-sm text-muted opacity-45 transition-opacity group-hover/title:opacity-100 group-focus-visible/title:opacity-100"
                />
              </button>
            )}
          </div>
          <KokoActionMenu
            ariaLabel={tr('Rule actions')}
            isDisabled={disabled}
            items={[
              {
                id: 'move-up',
                label: tr('Move up'),
                textValue: tr('Move up'),
                startContent: <MdArrowUpward />,
                isDisabled: index === 0
              },
              {
                id: 'move-down',
                label: tr('Move down'),
                textValue: tr('Move down'),
                startContent: <MdArrowDownward />,
                isDisabled: index === count - 1
              },
              {
                id: 'delete',
                label: tr('Delete'),
                textValue: tr('Delete'),
                startContent: <MdDeleteOutline />,
                tone: 'danger'
              }
            ]}
            onAction={(id) => {
              if (id === 'move-up') onMove(-1)
              if (id === 'move-down') onMove(1)
              if (id === 'delete') onDelete()
            }}
          >
            <MdMoreHoriz className="text-lg" />
          </KokoActionMenu>
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
                <KokoSelect
                  aria-label={tr('Match by')}
                  variant="secondary"
                  className="w-full min-w-0"
                  disallowEmptySelection
                  isDisabled={disabled}
                  options={[
                    { id: 'macos-process-name', label: tr('Process name') },
                    { id: 'macos-signing-identifier', label: tr('Signing identifier') }
                  ]}
                  value={rule.identifierKind!}
                  onChange={(value) => changeIdentifierKind(value as AppRoutingIdentifierKind)}
                />
              ) : (
                <KokoSelect
                  aria-label={tr('Match by')}
                  variant="secondary"
                  className="w-full min-w-0"
                  disallowEmptySelection
                  isDisabled={disabled}
                  options={[
                    {
                      id: 'linux-executable',
                      label: tr('Executable path'),
                      isDisabled: !rule.sourcePath
                    },
                    { id: 'linux-process-name', label: tr('Process name') }
                  ]}
                  value={rule.identifierKind!}
                  onChange={(value) => changeIdentifierKind(value as AppRoutingIdentifierKind)}
                />
              )}
            </div>
          )}
          <div className="min-w-0">
            <KokoSelect
              aria-label={tr('Protocol')}
              variant="secondary"
              className="w-full min-w-0"
              disallowEmptySelection
              isDisabled={disabled}
              options={Object.entries(protocolLabels).map(([id, label]) => ({ id, label }))}
              value={rule.protocol}
              onChange={(value) => onChange({ protocol: value as AppRoutingProtocol })}
            />
          </div>
          <div className="min-w-0">
            <div className="relative min-w-0">
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute start-3 top-1/2 z-10 size-1.5 -translate-y-1/2 rounded-full ${actionDotClass[rule.action]}`}
              />
              <KokoSelect
                aria-label={tr('Action')}
                variant="secondary"
                className="w-full min-w-0"
                valueClassName="ps-3"
                disallowEmptySelection
                isDisabled={disabled}
                options={actionOptions}
                value={rule.action}
                onChange={(value) => onChange({ action: value as AppRoutingAction })}
              />
            </div>
          </div>
          <Switch
            size="sm"
            aria-label={tr('Enable rule')}
            isSelected={rule.enabled}
            isDisabled={disabled}
            onChange={(enabled) => onChange({ enabled })}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>
      </Card.Content>
    </Card>
  )
}
