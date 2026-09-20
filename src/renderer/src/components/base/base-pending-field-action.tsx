import { Button } from '@heroui/react'
import React, { useState } from 'react'
import { LuCheck } from 'react-icons/lu'
import { tr } from '../../../../shared/i18n'

interface PendingFieldActionProps {
  isDisabled?: boolean
  isVisible: boolean
  onPress: () => void | Promise<unknown>
}

/** Compact commit action for fields that stage a local value before saving. */
export const PendingFieldAction: React.FC<PendingFieldActionProps> = ({
  isDisabled = false,
  isVisible,
  onPress
}) => {
  const [isPending, setIsPending] = useState(false)

  if (!isVisible) return null

  return (
    <Button
      aria-label={tr('Confirm')}
      className="size-8 min-w-8 shrink-0"
      isDisabled={isDisabled || isPending}
      isIconOnly
      isPending={isPending}
      size="sm"
      variant="primary"
      onPress={async () => {
        setIsPending(true)
        try {
          await onPress()
        } finally {
          setIsPending(false)
        }
      }}
    >
      <LuCheck aria-hidden="true" />
    </Button>
  )
}

export default PendingFieldAction
