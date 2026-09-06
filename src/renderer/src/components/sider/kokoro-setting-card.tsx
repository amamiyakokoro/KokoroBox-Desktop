import { tr } from '../../../../shared/i18n'
import { Button, Card, CardBody, CardFooter, Tooltip } from '@heroui/react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import React, { useState } from 'react'
import { LuHeartHandshake } from 'react-icons/lu'
import KokoroSubscriptionModal from '../profiles/kokoro-subscription-modal'

interface Props {
  iconOnly?: boolean
}

const KokoroSettingCard: React.FC<Props> = ({ iconOnly = false }) => {
  const { appConfig } = useAppConfig()
  const { mutateProfileConfig } = useProfileConfig()
  const { kokoroCardStatus = 'col-span-1', disableAnimation = false } = appConfig || {}
  const [showKokoroModal, setShowKokoroModal] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: sortableTransform,
    transition,
    isDragging
  } = useSortable({ id: 'kokoro' })
  const transform = sortableTransform
    ? { x: sortableTransform.x, y: sortableTransform.y, scaleX: 1, scaleY: 1 }
    : null

  const modal = showKokoroModal ? (
    <KokoroSubscriptionModal
      onClose={() => setShowKokoroModal(false)}
      onImported={() => {
        mutateProfileConfig()
        window.electron.ipcRenderer.send('updateTrayMenu')
      }}
    />
  ) : null

  if (iconOnly) {
    return (
      <>
        {modal}
        <div className={`${kokoroCardStatus} flex justify-center`}>
          <Tooltip content={tr('Kokoro 设置')} placement="right">
            <Button size="sm" isIconOnly variant="light" onPress={() => setShowKokoroModal(true)}>
              <LuHeartHandshake className="text-[20px]" />
            </Button>
          </Tooltip>
        </div>
      </>
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
      className={`${kokoroCardStatus} kokoro-setting-card`}
    >
      {modal}
      <Card
        fullWidth
        isPressable
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onPress={() => setShowKokoroModal(true)}
        className={`hover:bg-primary/30 ${isDragging ? `${disableAnimation ? '' : 'scale-[0.95]'} tap-highlight-transparent` : ''}`}
      >
        <CardBody className="pb-1 pt-0 px-0 overflow-y-visible">
          <div className="flex justify-between">
            <Button
              isIconOnly
              className="bg-transparent pointer-events-none"
              variant="flat"
              color="default"
            >
              <LuHeartHandshake className="text-foreground text-[24px]" />
            </Button>
          </div>
        </CardBody>
        <CardFooter className="pt-1">
          <h3 className="text-md font-bold text-foreground">{tr('Kokoro 设置')}</h3>
        </CardFooter>
      </Card>
    </div>
  )
}

export default KokoroSettingCard
