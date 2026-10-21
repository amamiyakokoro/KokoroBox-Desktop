import { Button, Tooltip } from '@heroui/react'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LuCompass } from 'react-icons/lu'
import { tr } from '../../../../shared/i18n'
import { pageTourRoutes, type PageTourId } from '@renderer/utils/page-tours'

export function PageTourButton({ id, ready }: { id: PageTourId; ready: boolean }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useEffect(() => {
    const controller = new AbortController()
    // The welcome tour owns first launch and may navigate through these pages.
    if (!ready || pathname !== pageTourRoutes[id] || !window.localStorage.getItem('tourShown'))
      return
    void import('@renderer/utils/driver')
      .then(({ startPageTour }) => startPageTour(id, navigate, { signal: controller.signal }))
      .catch(console.error)
    return () => {
      controller.abort()
      void import('@renderer/utils/driver').then(({ cancelPageTour }) => cancelPageTour(id))
    }
  }, [id, navigate, pathname, ready])

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Button
          size="sm"
          isIconOnly
          variant="ghost"
          className="app-nodrag"
          aria-label={tr('Open page guide')}
          onPress={() => {
            void import('@renderer/utils/driver')
              .then(({ startPageTour }) => startPageTour(id, navigate, { replay: true }))
              .catch(console.error)
          }}
        >
          <LuCompass className="text-lg" aria-hidden="true" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{tr('Open page guide')}</Tooltip.Content>
    </Tooltip>
  )
}
