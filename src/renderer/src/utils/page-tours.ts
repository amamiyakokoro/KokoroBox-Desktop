import { tr } from '../../../shared/i18n'
import type { DriveStep } from 'driver.js'

export const pageTourIds = [
  'profiles',
  'app-routing',
  'proxies',
  'connections',
  'rules',
  'override',
  'logs'
] as const
export type PageTourId = (typeof pageTourIds)[number]
export const pageTourRoutes: Record<PageTourId, string> = {
  profiles: '/profiles',
  'app-routing': '/app-routing',
  proxies: '/proxies',
  connections: '/connections',
  rules: '/rules',
  override: '/override',
  logs: '/logs'
}

export function pageTourSelector(id: PageTourId): string {
  return '[data-tour-page="' + id + '"]'
}

export function pageTourStorageKey(id: PageTourId): string {
  return 'kokorobox.page-tour.v1.' + id
}

export function pageTourSteps(id: PageTourId): DriveStep[] {
  const steps: Record<PageTourId, DriveStep[]> = {
    profiles: [
      {
        element: pageTourSelector(id) + ' ' + '.profiles-sticky',
        popover: {
          title: tr('Import subscription'),
          description: tr(
            'Paste a subscription URL and import it here. Use the plus menu to sign in to Kokoro or import a local file.'
          ),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: pageTourSelector(id) + ' ' + '.new-profile',
        popover: {
          title: tr('Local profile'),
          description: tr(
            'The plus menu can also create a blank local profile. Choose this when you want to write your own configuration.'
          ),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: pageTourSelector(id) + ' ' + '.profiles-tour-list',
        popover: {
          title: tr('Subscriptions'),
          description: tr(
            'Select a profile to activate it. Each card offers update and edit actions; its settings also control automatic updates and enabled overrides.'
          ),
          side: 'bottom',
          align: 'start'
        }
      }
    ],
    'app-routing': [
      {
        element: pageTourSelector(id) + ' ' + '.app-routing-status-card',
        popover: {
          title: tr('Application routing'),
          description: tr(
            'Application routing sends selected apps through local Mihomo without requiring system proxy or TUN. Check the status here before enabling it.'
          ),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: pageTourSelector(id) + ' ' + '.app-routing-rule-composer',
        popover: {
          title: tr('Application rules'),
          description: tr(
            'Select an application or enter a matching pattern, then choose Proxy, Direct, or Block in its rule. Rules match from top to bottom.'
          ),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: pageTourSelector(id) + ' ' + '[data-tour="app-routing-settings"]',
        popover: {
          title: tr('Application routing settings'),
          description: tr(
            'Open settings for default rule actions, UDP DNS handling, and diagnostic logging. Expand Status and recovery when routing needs attention.'
          ),
          side: 'bottom',
          align: 'start'
        }
      }
    ],
    proxies: [
      {
        element: pageTourSelector(id) + ' ' + '.content',
        popover: {
          title: tr('Proxy groups'),
          description: tr(
            'Proxy groups choose which server handles traffic. Rule mode uses the group selected by a matching rule; Global mode uses the global group. Direct mode does not use proxy groups.'
          ),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: pageTourSelector(id) + ' ' + '[role="toolbar"]',
        popover: {
          title: tr('Search proxy groups'),
          description: tr(
            'Search for a group here. Expand a group to view its servers, select a server, and check latency where available.'
          ),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: pageTourSelector(id) + ' ' + '[data-tour="proxies-settings"]',
        popover: {
          title: tr('Proxy group settings'),
          description: tr(
            'Adjust group layout, ordering, and latency-test behavior in settings. Automatic groups select servers according to their own policy.'
          ),
          side: 'bottom',
          align: 'start'
        }
      }
    ],
    connections: [
      {
        element: pageTourSelector(id) + ' ' + '[role="toolbar"]',
        popover: {
          title: tr('Connections'),
          description: tr(
            'Switch between active connections and closed records. Filter and sort the list to find an application, destination, or connection.'
          ),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: pageTourSelector(id) + ' ' + '[data-tour="connections-list"]',
        popover: {
          title: tr('Details'),
          description: tr(
            'Open a connection to inspect its destination, matched rule, proxy chain, and traffic. The list can be empty when no applications are connecting.'
          ),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: pageTourSelector(id) + ' ' + '.header',
        popover: {
          title: tr('Connection settings'),
          description: tr(
            'Pause the display to inspect live traffic, or use settings to group connections by application. Closing a connection interrupts that connection.'
          ),
          side: 'bottom',
          align: 'start'
        }
      }
    ],
    rules: [
      {
        element: pageTourSelector(id) + ' ' + '[role="toolbar"]',
        popover: {
          title: tr('Rules'),
          description: tr(
            'Switch between routing rules and rule collections. Use search to find a domain, network, process, or collection.'
          ),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: pageTourSelector(id) + ' ' + '[data-tour="rules-content"]',
        popover: {
          title: tr('Routing rules'),
          description: tr(
            'Routing rules are evaluated in order, and the first match decides the route. This page shows the rules currently loaded by the core.'
          ),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: pageTourSelector(id) + ' ' + '[role="toolbar"]',
        popover: {
          title: tr('Rule collections'),
          description: tr(
            'Rule collections contain remote rule sets and can be refreshed from their tab. To change routing rules, edit the profile or its overrides, or use Kokoro rule settings.'
          ),
          side: 'bottom',
          align: 'start'
        }
      }
    ],
    override: [
      {
        element: pageTourSelector(id) + ' ' + '.overrides-tour-import',
        popover: {
          title: tr('Overrides'),
          description: tr(
            'Import an override URL or use the plus menu to create YAML or JavaScript overrides. Overrides customize a profile without editing its downloaded content.'
          ),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: pageTourSelector(id) + ' ' + '.overrides-tour-list',
        popover: {
          title: tr('Subscriptions'),
          description: tr(
            'Creating an override does not apply it automatically. Enable it on each profile that should use it in the subscription settings.'
          ),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: pageTourSelector(id) + ' ' + '[data-tour="override-help"]',
        popover: {
          title: tr('Override help'),
          description: tr(
            'Open Help for YAML merge syntax, JavaScript examples, and the order in which overrides are applied.'
          ),
          side: 'bottom',
          align: 'start'
        }
      }
    ],
    logs: [
      {
        element: pageTourSelector(id) + ' ' + '[role="toolbar"]',
        popover: {
          title: tr('Log source'),
          description: tr(
            'Choose Core, App routing, or Service logs to inspect the component involved in a problem. A source can be empty until it produces new records.'
          ),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: pageTourSelector(id) + ' ' + '[data-tour="logs-content"]',
        popover: {
          title: tr('Live logs'),
          description: tr(
            'Inspect timestamps, levels, and messages here. Open a log entry menu to copy information or create a rule when supported.'
          ),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: pageTourSelector(id) + ' ' + '[role="toolbar"]',
        popover: {
          title: tr('Filter by log level'),
          description: tr(
            'Filter by text or level and toggle following new logs. Clear removes displayed records; it does not repair a connection or change routing.'
          ),
          side: 'bottom',
          align: 'start'
        }
      }
    ]
  }
  return steps[id]
}
