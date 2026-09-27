import { useEffect, useRef, useState } from 'react'

// HeroUI's drawer exit transition is 200ms; keep the parent mounted through its end.
const DRAWER_CLOSE_ANIMATION_MS = 220

export function useAnimatedDrawerClose(onClose: () => void) {
  const [isOpen, setIsOpen] = useState(true)
  const [isSlideOpen, setIsSlideOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    // Keep the panel off-screen for a paint before starting its entrance transition.
    let secondFrame: number | undefined
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (closeTimer.current === null) setIsSlideOpen(true)
      })
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame)
    }
  }, [])

  useEffect(
    () => () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    },
    []
  )

  const requestClose = (): void => {
    if (closeTimer.current !== null) return
    setIsOpen(false)
    setIsSlideOpen(false)
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      onCloseRef.current()
    }, DRAWER_CLOSE_ANIMATION_MS)
  }

  return { isOpen, isSlideOpen, requestClose }
}
