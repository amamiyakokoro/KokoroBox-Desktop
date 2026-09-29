import { tr } from '../../../shared/i18n'
import type { DriveStep, Driver } from 'driver.js'
import type { NavigateFunction } from 'react-router-dom'
import { createTourNavigation, type TourPage } from './tour-navigation'

type TourStep = DriveStep & { route?: string }

const pageSelectors: Record<string, string> = {
  '/': '.home-overview',
  '/kokoro': '.kokoro-settings-guide',
  '/profiles': '.profiles-sticky',
  '/settings?section=network&panel=system-proxy': '.sysproxy-settings',
  '/settings?section=network&panel=tun': '.tun-settings',
  '/settings?section=network&panel=dns': '.dns-settings'
}

let driverInstance: Driver | null = null
let tourNavigation: ReturnType<typeof createTourNavigation> | null = null
let startingTour: Promise<boolean> | null = null
let cssLoaded = false

function visibleElement(selector: string): Element | undefined {
  return Array.from(document.querySelectorAll(selector)).find(
    (element) => element.getClientRects().length > 0
  )
}

function waitForPage(page: TourPage, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = performance.now() + 5000
    let frame = 0
    const finish = (ready: boolean): void => {
      cancelAnimationFrame(frame)
      signal.removeEventListener('abort', onAbort)
      resolve(ready)
    }
    const onAbort = (): void => finish(false)
    const check = (): void => {
      if (signal.aborted) return finish(false)
      if (visibleElement(page.readySelector)) return finish(true)
      if (performance.now() >= deadline) return finish(false)
      frame = requestAnimationFrame(check)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    // Wait for React to commit the destination, including lazy page imports.
    frame = requestAnimationFrame(check)
  })
}

async function loadDriverModule(): Promise<typeof import('driver.js')> {
  if (!cssLoaded) {
    await import('driver.js/dist/driver.css')
    cssLoaded = true
  }
  return import('driver.js')
}

export async function createDriver(navigate: NavigateFunction): Promise<Driver> {
  const { driver } = await loadDriverModule()
  tourNavigation?.cancel()
  driverInstance?.destroy()

  const steps: TourStep[] = [
    {
      popover: {
        title: tr('Welcome to KokoroBox'),
        description: tr(
          'Learn how to add a subscription and enable the proxy. You can close this tour and reopen it from settings at any time.'
        ),
        showButtons: ['next', 'close'],
        align: 'center'
      }
    },
    {
      element: '.side',
      popover: {
        title: tr('Sidebar'),
        description: tr(
          'The sidebar on the left also acts as a dashboard. Switch pages here and see common status information at a glance.'
        ),
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '.side .profile-card',
      popover: {
        title: tr('Cards'),
        description: tr('Click a sidebar card to open its page. Drag cards to rearrange them.'),
        side: 'right',
        align: 'start'
      }
    },
    {
      element: '.main',
      popover: {
        title: tr('Main area'),
        description: tr('The main area on the right displays the page selected in the sidebar'),
        side: 'left',
        align: 'center'
      }
    },
    {
      element: '.kokoro-setting-card',
      popover: {
        title: tr('Kokoro settings'),
        description: tr('Sign in with osu! to securely fetch a Mihomo profile from Kokoro'),
        side: 'right',
        align: 'start'
      }
    },
    {
      element: '.kokoro-settings-guide',
      route: '/kokoro',
      popover: {
        title: tr('Kokoro subscription'),
        description: tr(
          'After signing in, choose your plan, ISP, and protocol, adjust routing and update settings as needed, then select “Fetch and add”.'
        ),
        side: 'left',
        align: 'start'
      }
    },
    {
      element: '.profile-card',
      popover: {
        title: tr('Subscriptions'),
        description: tr(
          'The subscription card shows the active profile. Click it to open the subscription management page.'
        ),
        side: 'right',
        align: 'start'
      }
    },
    {
      element: '.profiles-sticky',
      route: '/profiles',
      popover: {
        title: tr('Import subscription'),
        description: tr(
          'KokoroBox supports several ways to import subscriptions. Enter a subscription URL here and click Import. If updates require a proxy, enable "Proxy" before importing. This requires an existing working profile.'
        ),
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '.new-profile',
      route: '/profiles',
      popover: {
        title: tr('Local profile'),
        description: tr('Click "+" to import a local file or create a blank configuration to edit'),
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '.sysproxy-card',
      popover: {
        title: tr('System proxy'),
        description: tr(
          'After importing a subscription, the core starts listening on the configured ports. You can use the proxy through those ports. Enable System proxy to have most apps use it automatically.'
        ),
        side: 'right',
        align: 'start'
      }
    },
    {
      element: '.sysproxy-settings',
      route: '/settings?section=network&panel=system-proxy',
      popover: {
        title: tr('System proxy settings'),
        description: tr(
          'Configure the system proxy and choose a proxy mode here. On Windows, manage UWP loopback exemptions here when an app cannot connect to the local proxy.'
        ),
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '.tun-card',
      popover: {
        title: tr('TUN mode'),
        description: tr(
          'TUN mode creates a virtual network interface so the core can handle all traffic, including apps that do not use the system proxy.'
        ),
        side: 'right',
        align: 'start'
      }
    },
    {
      element: '.tun-settings',
      route: '/settings?section=network&panel=tun',
      popover: {
        title: tr('TUN settings'),
        description: tr(
          'Configure TUN mode here. KokoroBox handles the required permissions. If TUN still does not work, try resetting the firewall on Windows or manually authorizing the core on macOS/Linux, then restart the core.'
        ),
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '.override-card',
      popover: {
        title: tr('Overrides'),
        description: tr(
          'Customize imported profiles with YAML or JavaScript overrides. <b>Enable each override on the profiles that should use it.</b> Open Help on the Overrides page for examples.'
        ),
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '.dns-settings',
      route: '/settings?section=network&panel=dns',
      popover: {
        title: 'DNS',
        description: tr(
          'The app overrides core DNS settings by default. To use the DNS settings from your profile, disable "Override DNS settings" in Application settings. The same applies to domain sniffing.'
        ),
        side: 'right',
        align: 'center'
      }
    },
    {
      route: '/profiles',
      popover: {
        title: tr('Tour complete'),
        description: tr(
          'You now know the basics. Import your subscription to get started. Enjoy KokoroBox!'
        ),
        side: 'top',
        align: 'center'
      }
    }
  ]
  const instance = driver({
    showProgress: true,
    nextBtnText: tr('Next'),
    prevBtnText: tr('Back'),
    doneBtnText: tr('Done'),
    progressText: '{{current}} / {{total}}',
    overlayOpacity: 0.55,
    duration: 180,
    disableActiveInteraction: true,
    animate:
      document.documentElement.dataset.reduceMotion !== 'true' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    steps: steps.map(({ route: _route, ...step }) => ({
      ...step,
      element:
        typeof step.element === 'string'
          ? () =>
              visibleElement(step.element as string) ??
              visibleElement(
                (step.element as string).endsWith('-card') ? '.side' : '.main .content'
              ) ??
              document.body
          : step.element
    })),
    onNextClick: (_element, _step, { index }) => {
      void navigation.goTo((index ?? 0) + 1).catch(console.error)
    },
    onPrevClick: (_element, _step, { index }) => {
      void navigation.goTo((index ?? 0) - 1).catch(console.error)
    },
    onDestroyed: () => navigation.cancel(),
    onPopoverRender: (popover) => {
      popover.closeButton.setAttribute('aria-label', tr('Close'))
    }
  })
  const navigation = createTourNavigation({
    pages: steps.map((step) => {
      const route = step.route ?? '/'
      return { route, readySelector: pageSelectors[route] }
    }),
    navigate: (route) => navigate(route, { flushSync: true }),
    waitForPage,
    showStep: (index, starting) => {
      if (starting) instance.drive(index)
      else instance.moveTo(index)
    },
    close: () => instance.destroy(),
    setPending: (pending) => {
      const popover = instance.getState().popover
      if (!popover) return
      popover.nextButton.disabled = pending
      popover.previousButton.disabled = pending || instance.isFirstStep()
    }
  })
  driverInstance = instance
  tourNavigation = navigation
  return instance
}

export function startTour(navigate: NavigateFunction): Promise<boolean> {
  if (startingTour) return startingTour
  startingTour = (async () => {
    await createDriver(navigate)
    const started = (await tourNavigation?.goTo(0, true)) ?? false
    if (started) window.localStorage.setItem('tourShown', 'true')
    return started
  })().finally(() => {
    startingTour = null
  })
  return startingTour
}

export function getDriver(): Driver | null {
  return driverInstance
}
