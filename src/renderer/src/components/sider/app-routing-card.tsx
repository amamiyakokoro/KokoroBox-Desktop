import { tr } from '../../../../shared/i18n'
import { Button, Card, CardBody, CardFooter, Tooltip } from '@heroui/react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import React from 'react'
import { MdOutlineAppShortcut } from 'react-icons/md'
import { useLocation, useNavigate } from 'react-router-dom'

interface Props {
  iconOnly?: boolean
}

const AppRoutingCard: React.FC<Props> = ({ iconOnly = false }) => {
  const { appConfig } = useAppConfig()
  const { appRoutingCardStatus = 'col-span-2', disableAnimation = false } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/app-routing')
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: sortableTransform,
    transition,
    isDragging
  } = useSortable({ id: 'app-routing' })
  const transform = sortableTransform
    ? { x: sortableTransform.x, y: sortableTransform.y, scaleX: 1, scaleY: 1 }
    : null

  if (iconOnly) {
    return (
      <div className={`${appRoutingCardStatus} app-routing-card flex justify-center`}>
        <Tooltip content={tr('应用分流')} placement="right">
          <Button
            size="sm"
            isIconOnly
            color={match ? 'primary' : 'default'}
            variant={match ? 'solid' : 'light'}
            onPress={() => navigate('/app-routing')}
          >
            <MdOutlineAppShortcut className="text-[21px]" />
          </Button>
        </Tooltip>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined
      }}
      className={`${appRoutingCardStatus} app-routing-card`}
      {...attributes}
      {...listeners}
    >
      <Card
        fullWidth
        className={`${match ? 'bg-primary' : 'hover:bg-primary/30'} ${isDragging ? `${disableAnimation ? '' : 'scale-[0.95]'} tap-highlight-transparent` : ''}`}
      >
        <CardBody className="pb-1 pt-0 px-0 overflow-y-visible">
          <Button isIconOnly className="bg-transparent pointer-events-none" variant="flat">
            <MdOutlineAppShortcut
              className={`${match ? 'text-primary-foreground' : 'text-foreground'} text-[24px]`}
            />
          </Button>
        </CardBody>
        <CardFooter className="pt-1">
          <h3
            className={`text-md font-bold ${match ? 'text-primary-foreground' : 'text-foreground'}`}
          >
            {tr('应用分流')}
          </h3>
        </CardFooter>
      </Card>
    </div>
  )
}

export default AppRoutingCard
