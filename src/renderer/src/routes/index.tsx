import { useLayoutEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { markInitialContentPartReady } from '@renderer/utils/startup'
import {
  Connections,
  Kokoro,
  Logs,
  Override,
  Profiles,
  Proxies,
  Resources,
  Rules,
  Settings,
  AppRouting
} from './route-pages'

export { useDeferredRoutePreload } from './route-pages'

function StartupRoute({ children }: { children: ReactNode }): ReactNode {
  useLayoutEffect(() => {
    markInitialContentPartReady('route')
  }, [])
  return children
}

function startupRoute(element: ReactNode): ReactNode {
  return <StartupRoute>{element}</StartupRoute>
}

const routes = [
  {
    path: 'mihomo',
    element: startupRoute(<Navigate to="/settings?section=core&panel=mihomo" replace />)
  },
  {
    path: 'sysproxy',
    element: startupRoute(<Navigate to="/settings?section=network&panel=system-proxy" replace />)
  },
  {
    path: 'tun',
    element: startupRoute(<Navigate to="/settings?section=network&panel=tun" replace />)
  },
  {
    path: 'app-routing',
    element: startupRoute(<AppRouting />)
  },
  {
    path: 'proxies',
    element: startupRoute(<Proxies />)
  },
  {
    path: 'rules',
    element: startupRoute(<Rules />)
  },
  {
    path: 'resources',
    element: startupRoute(<Resources />)
  },
  {
    path: 'dns',
    element: startupRoute(<Navigate to="/settings?section=network&panel=dns" replace />)
  },
  {
    path: 'sniffer',
    element: startupRoute(<Navigate to="/settings?section=network&panel=sniffer" replace />)
  },
  {
    path: 'logs',
    element: startupRoute(<Logs />)
  },
  {
    path: 'connections',
    element: startupRoute(<Connections />)
  },
  {
    path: 'override',
    element: startupRoute(<Override />)
  },
  {
    path: 'profiles',
    element: startupRoute(<Profiles />)
  },
  {
    path: 'kokoro',
    element: startupRoute(<Kokoro />)
  },
  {
    path: 'settings',
    element: startupRoute(<Settings />)
  },
  {
    index: true,
    element: <Navigate to="/proxies" />
  }
]

export default routes
