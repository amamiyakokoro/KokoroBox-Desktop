import { useEffect, useRef, useState } from 'react'

// HeroUI's drawer exit transition is 200ms; keep the parent mounted through its end.
const DRAWER_CLOSE_ANIMATION_MS = 220

export function useAnimatedDrawerClose(onClose: () => void) {
  const [isOpen, setIsOpen] = useState(true)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(
    () => () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    },
    []
  )

  const requestClose = (): void => {
    if (closeTimer.current !== null) return
    setIsOpen(false)
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      onCloseRef.current()
    }, DRAWER_CLOSE_ANIMATION_MS)
  }

  return { isOpen, requestClose }
}
