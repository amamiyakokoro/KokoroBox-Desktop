import { tr } from '../../../../shared/i18n'
import { appRoutingSupported } from '../../../../shared/app-routing'
import React from 'react'
import { Button, Switch, Tooltip } from '@heroui/react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { LuGripVertical } from 'react-icons/lu'
import { normalizeSiderOrder, resolveRulesCardStatus } from '../sider/sider-order'

type SiderCardConfigKey =
  | 'sysproxyCardStatus'
  | 'tunCardStatus'
  | 'appRoutingCardStatus'
  | 'profileCardStatus'
  | 'kokoroCardStatus'
  | 'proxyCardStatus'
  | 'ruleCardStatus'
  | 'resourceCardStatus'
  | 'overrideCardStatus'
  | 'connectionCardStatus'
  | 'mihomoCoreCardStatus'
  | 'dnsCardStatus'
  | 'sniffCardStatus'
  | 'logCardStatus'

interface SiderConfigEntry {
  id: string
  key: SiderCardConfigKey
  legacyKey?: SiderCardConfigKey
  title: string
  defaultStatus: Exclude<CardStatus, 'hidden'>
  supported?: boolean
}

interface SiderConfigGroup {
  title: string
  entries: SiderConfigEntry[]
  reorderable?: boolean
}

interface SortableSiderConfigItemProps {
  item: SiderConfigEntry
  status: CardStatus
  divider: boolean
  canReorder: boolean
  onVisibilityChange: (visible: boolean) => void
}

const SortableSiderConfigItem = ({
  item,
  status,
  divider,
  canReorder,
  onVisibilityChange
}: SortableSiderConfigItemProps): React.JSX.Element => {
  const {
    attributes,
    listeners,
    isDragging,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition
  } = useSortable({ id: item.id, disabled: !canReorder })

  return (
    <SettingItem
      contentAlign="end"
      title={item.title}
      divider={divider}
      rootRef={setNodeRef}
      rootStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined
      }}
      rootClassName={isDragging ? 'relative opacity-70' : undefined}
    >
      <div className="flex items-center gap-1">
        {canReorder && (
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button
                {...attributes}
                {...listeners}
                ref={setActivatorNodeRef}
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={`${tr('Reorder')}: ${item.title}`}
                className="cursor-grab touch-none active:cursor-grabbing"
                data-sider-order-handle
              >
                <LuGripVertical aria-hidden="true" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>{`${tr('Reorder')}: ${item.title}`}</Tooltip.Content>
          </Tooltip>
        )}
        <Switch
          size="sm"
          aria-label={item.title}
          isSelected={status !== 'hidden'}
          onChange={onVisibilityChange}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </div>
    </SettingItem>
  )
}

const SiderConfig: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const groups: SiderConfigGroup[] = [
    {
      title: tr('Quick controls'),
      entries: [
        {
          id: 'sysproxy',
          key: 'sysproxyCardStatus',
          title: tr('System proxy'),
          defaultStatus: 'col-span-1'
        },
        {
          id: 'tun',
          key: 'tunCardStatus',
          title: tr('TUN mode'),
          defaultStatus: 'col-span-1'
        },
        { id: 'dns', key: 'dnsCardStatus', title: 'DNS', defaultStatus: 'col-span-1' },
        {
          id: 'sniff',
          key: 'sniffCardStatus',
          title: tr('Sniffing'),
          defaultStatus: 'col-span-1'
        },
        {
          id: 'mihomo',
          key: 'mihomoCoreCardStatus',
          title: tr('Core'),
          defaultStatus: 'col-span-2'
        }
      ]
    },
    {
      title: 'Kokoro',
      reorderable: false,
      entries: [
        {
          id: 'kokoro',
          key: 'kokoroCardStatus',
          title: tr('Kokoro account'),
          defaultStatus: 'col-span-2'
        }
      ]
    },
    {
      title: tr('Current status'),
      entries: [
        {
          id: 'profile',
          key: 'profileCardStatus',
          title: tr('Subscription'),
          defaultStatus: 'col-span-2'
        },
        {
          id: 'app-routing',
          key: 'appRoutingCardStatus',
          title: tr('Application routing'),
          defaultStatus: 'col-span-2',
          supported: appRoutingSupported(window.api.platform, window.api.arch)
        },
        {
          id: 'proxy',
          key: 'proxyCardStatus',
          title: tr('Proxy groups'),
          defaultStatus: 'col-span-2'
        },
        {
          id: 'connection',
          key: 'connectionCardStatus',
          title: tr('Connections'),
          defaultStatus: 'col-span-2'
        },
        {
          id: 'rule',
          key: 'ruleCardStatus',
          legacyKey: 'resourceCardStatus',
          title: tr('Rules'),
          defaultStatus: 'col-span-1'
        },
        {
          id: 'override',
          key: 'overrideCardStatus',
          title: tr('Overrides'),
          defaultStatus: 'col-span-1'
        },
        {
          id: 'log',
          key: 'logCardStatus',
          title: tr('Logs'),
          defaultStatus: 'col-span-1'
        }
      ]
    }
  ]
  const siderOrder = normalizeSiderOrder(appConfig?.siderOrder)

  const reorderSiderGroup = async (
    entries: SiderConfigEntry[],
    event: DragEndEvent
  ): Promise<void> => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const entryIds = entries.map((item) => item.id)
    const oldIndex = entryIds.indexOf(String(active.id))
    const newIndex = entryIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return

    const reorderedIds = arrayMove(entryIds, oldIndex, newIndex)
    const groupIds = new Set(reorderedIds)
    let groupIndex = 0
    const nextOrder = siderOrder.map((id) => (groupIds.has(id) ? reorderedIds[groupIndex++] : id))
    await patchAppConfig({ siderOrder: nextOrder })
  }

  return (
    <section data-setting-label={tr('Sidebar settings')} tabIndex={-1}>
      {groups.map((group) => {
        const entries = group.entries
          .filter((item) => item.supported !== false)
          .sort((left, right) => siderOrder.indexOf(left.id) - siderOrder.indexOf(right.id))
        return (
          <SettingCard key={group.title} header={group.title}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => void reorderSiderGroup(entries, event)}
            >
              <SortableContext
                items={entries.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {entries.map((item, index) => {
                  const status =
                    item.id === 'rule'
                      ? resolveRulesCardStatus(
                          appConfig?.ruleCardStatus,
                          appConfig?.resourceCardStatus
                        )
                      : (appConfig?.[item.key] ?? item.defaultStatus)
                  const canReorder = group.reorderable !== false && entries.length > 1
                  return (
                    <SortableSiderConfigItem
                      key={item.key}
                      item={item}
                      status={status}
                      divider={index !== entries.length - 1}
                      canReorder={canReorder}
                      onVisibilityChange={(visible) => {
                        const nextStatus = visible ? item.defaultStatus : 'hidden'
                        void patchAppConfig({
                          [item.key]: nextStatus,
                          ...(item.legacyKey ? { [item.legacyKey]: 'hidden' } : {})
                        })
                      }}
                    />
                  )
                })}
              </SortableContext>
            </DndContext>
          </SettingCard>
        )
      })}
    </section>
  )
}

export default SiderConfig
