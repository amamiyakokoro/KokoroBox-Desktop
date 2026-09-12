import { tr } from '../../../shared/i18n'
import type { NavigateFunction } from 'react-router-dom'

type Driver = {
  drive: () => void
  destroy: () => void
  moveNext: () => void
}

let driverInstance: Driver | null = null
let cssLoaded = false

async function loadDriverModule(): Promise<typeof import('driver.js')> {
  if (!cssLoaded) {
    await import('driver.js/dist/driver.css')
    cssLoaded = true
  }
  return import('driver.js')
}

export async function createDriver(navigate: NavigateFunction): Promise<Driver> {
  if (driverInstance) return driverInstance

  const { driver } = await loadDriverModule()

  driverInstance = driver({
    showProgress: true,
    nextBtnText: tr('Next'),
    prevBtnText: tr('Back'),
    doneBtnText: tr('Done'),
    progressText: '{{current}} / {{total}}',
    overlayOpacity: 0.9,
    steps: [
      {
        element: 'none',
        popover: {
          title: tr('Welcome to KokoroBox'),
          description: tr(
            'This interactive tour introduces the app. If you already know your way around, close it using the button at the top right. You can reopen the tour from settings at any time.'
          ),
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
        element: '.sysproxy-card',
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
          align: 'start',
          onNextClick: async (): Promise<void> => {
            navigate('/kokoro')
            setTimeout(() => {
              driverInstance?.moveNext()
            }, 0)
          }
        }
      },
      {
        element: '.kokoro-settings-guide',
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
          align: 'start',
          onNextClick: async (): Promise<void> => {
            navigate('/profiles')
            setTimeout(() => {
              driverInstance?.moveNext()
            }, 0)
          }
        }
      },
      {
        element: '.profiles-sticky',
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
        popover: {
          title: tr('Local profile'),
          description: tr(
            'Click "+" to import a local file or create a blank configuration to edit'
          ),
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
          align: 'start',
          onNextClick: async (): Promise<void> => {
            navigate('/sysproxy')
            setTimeout(() => {
              driverInstance?.moveNext()
            }, 0)
          }
        }
      },
      {
        element: '.sysproxy-settings',
        popover: {
          title: tr('System proxy settings'),
          description: tr(
            'Configure the system proxy and choose a proxy mode here. If some Windows apps do not use the system proxy, the UWP tool can remove their loopback restrictions. Consult documentation on manual and PAC proxy modes if you are unsure which to use.'
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
          align: 'start',
          onNextClick: async (): Promise<void> => {
            navigate('/tun')
            setTimeout(() => {
              driverInstance?.moveNext()
            }, 0)
          }
        }
      },
      {
        element: '.tun-settings',
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
            'KokoroBox lets you customize imported profiles with overrides, including rules and proxy groups. Import an existing override or write your own. <b>Remember to enable the override on the profiles that should use it.</b> See the <a href="https://mihomo.party/docs/guide/override" target="_blank">official documentation</a> for the syntax.'
          ),
          side: 'right',
          align: 'center'
        }
      },
      {
        element: '.dns-card',
        popover: {
          title: 'DNS',
          description: tr(
            'The app overrides core DNS settings by default. To use the DNS settings from your profile, disable "Override DNS settings" in Application settings. The same applies to domain sniffing.'
          ),
          side: 'right',
          align: 'center',
          onNextClick: async (): Promise<void> => {
            navigate('/profiles')
            setTimeout(() => {
              driverInstance?.moveNext()
            }, 0)
          }
        }
      },
      {
        element: 'none',
        popover: {
          title: tr('Tour complete'),
          description: tr(
            'You now know the basics. Import your subscription to get started. Enjoy KokoroBox!'
          ),
          side: 'top',
          align: 'center',
          onNextClick: async (): Promise<void> => {
            navigate('/profiles')
            setTimeout(() => {
              driverInstance?.destroy()
            }, 0)
          }
        }
      }
    ]
  })

  return driverInstance
}

export async function startTour(navigate: NavigateFunction): Promise<void> {
  const d = await createDriver(navigate)
  d.drive()
}

export function getDriver(): Driver | null {
  return driverInstance
}
