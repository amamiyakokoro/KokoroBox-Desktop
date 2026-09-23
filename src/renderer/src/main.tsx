import React from 'react'
import './utils/locale'
import { getLocale } from '../../shared/i18n'
import ReactDOM from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { I18nProvider } from 'react-aria'
import { init, platform } from '@renderer/utils/init'
import '@renderer/assets/main.css'
import App from '@renderer/App'
import BaseErrorBoundary from './components/base/base-error-boundary'
import { openDevTools, quitApp } from './utils/ipc'
import { AppConfigProvider } from './hooks/use-app-config'
import { ControledMihomoConfigProvider } from './hooks/use-controled-mihomo-config'
import { OverrideConfigProvider } from './hooks/use-override-config'
import { ProfileConfigProvider } from './hooks/use-profile-config'
import { RulesProvider } from './hooks/use-rules'
import { GroupsProvider } from './hooks/use-groups'
import AppNotificationProvider from './components/base/app-notification-provider'
import routes from './routes'
import { UnsavedChangesProvider } from './hooks/use-unsaved-changes'

let F12Count = 0

if (!window.location.hash) {
  window.history.replaceState(null, '', '#/')
}

const ApplicationProviders: React.FC = () => (
  <AppConfigProvider>
    <ControledMihomoConfigProvider>
      <ProfileConfigProvider>
        <OverrideConfigProvider>
          <GroupsProvider>
            <RulesProvider>
              <UnsavedChangesProvider>
                <App />
              </UnsavedChangesProvider>
            </RulesProvider>
          </GroupsProvider>
        </OverrideConfigProvider>
      </ProfileConfigProvider>
    </ControledMihomoConfigProvider>
  </AppConfigProvider>
)

const router = createHashRouter([
  {
    path: '/',
    element: <ApplicationProviders />,
    children: routes
  }
])

init().then(() => {
  document.addEventListener('keydown', (e) => {
    if (platform !== 'darwin' && e.ctrlKey && e.key === 'q') {
      e.preventDefault()
      quitApp()
    }
    if (platform === 'darwin' && e.metaKey && e.key === 'q') {
      e.preventDefault()
      quitApp()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      window.close()
    }
    if (e.key === 'F12') {
      e.preventDefault()
      F12Count++
      if (F12Count >= 5) {
        openDevTools()
        F12Count = 0
      }
    }
  })
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider locale={getLocale()}>
      <NextThemesProvider attribute="class" enableSystem defaultTheme="dark">
        <AppNotificationProvider />
        <BaseErrorBoundary>
          <RouterProvider router={router} />
        </BaseErrorBoundary>
      </NextThemesProvider>
    </I18nProvider>
  </React.StrictMode>
)
