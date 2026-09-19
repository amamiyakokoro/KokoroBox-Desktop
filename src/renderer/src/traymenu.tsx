import React from 'react'
import './utils/locale'
import { getLocale } from '../../shared/i18n'
import ReactDOM from 'react-dom/client'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { I18nProvider } from 'react-aria'
import '@renderer/assets/traymenu.css'
import TrayMenuApp from '@renderer/TrayMenuApp'
import BaseErrorBoundary from './components/base/base-error-boundary'
import { AppConfigProvider } from './hooks/use-app-config'
import { ControledMihomoConfigProvider } from './hooks/use-controled-mihomo-config'
import { GroupsProvider } from './hooks/use-groups'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider locale={getLocale()}>
      <NextThemesProvider attribute="class" enableSystem defaultTheme="dark">
        <BaseErrorBoundary>
          <AppConfigProvider>
            <ControledMihomoConfigProvider>
              <GroupsProvider>
                <TrayMenuApp />
              </GroupsProvider>
            </ControledMihomoConfigProvider>
          </AppConfigProvider>
        </BaseErrorBoundary>
      </NextThemesProvider>
    </I18nProvider>
  </React.StrictMode>
)
