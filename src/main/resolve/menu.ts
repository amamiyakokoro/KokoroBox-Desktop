import { tr } from '../../shared/i18n'
import { app, Menu, shell, dialog } from 'electron'
import { mainWindow } from '..'
import { getAppConfig } from '../config'
import { quitWithoutCore } from '../core/manager'
import { dataDir, logDir, mihomoCoreDir, mihomoWorkDir } from '../utils/dirs'

export async function createApplicationMenu(): Promise<void> {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }

  const { quitWithoutCoreShortcut = '', restartAppShortcut = '' } = await getAppConfig()

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.getName(),
      submenu: [
        {
          label: tr('About ') + app.getName(),
          role: 'about'
        },
        { type: 'separator' },
        {
          label: tr('Hide') + app.getName(),
          accelerator: 'Command+H',
          role: 'hide'
        },
        {
          label: tr('Hide others'),
          accelerator: 'Command+Alt+H',
          role: 'hideOthers'
        },
        {
          label: tr('Show all'),
          role: 'unhide'
        },
        { type: 'separator' },
        {
          label: tr('Quit and keep core running'),
          accelerator: quitWithoutCoreShortcut,
          click: () => {
            quitWithoutCore()
          }
        },
        {
          label: tr('Restart app'),
          accelerator: restartAppShortcut,
          click: () => {
            app.relaunch()
            app.quit()
          }
        },
        {
          label: tr('Quit app'),
          accelerator: 'Command+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: tr('Edit'),
      submenu: [
        {
          label: tr('Undo'),
          accelerator: 'CmdOrCtrl+Z',
          role: 'undo'
        },
        {
          label: tr('Redo'),
          accelerator: 'Shift+CmdOrCtrl+Z',
          role: 'redo'
        },
        { type: 'separator' },
        {
          label: tr('Cut'),
          accelerator: 'CmdOrCtrl+X',
          role: 'cut'
        },
        {
          label: tr('Copy'),
          accelerator: 'CmdOrCtrl+C',
          role: 'copy'
        },
        {
          label: tr('Paste'),
          accelerator: 'CmdOrCtrl+V',
          role: 'paste'
        },
        {
          label: tr('Delete'),
          accelerator: 'CmdOrCtrl+Backspace',
          role: 'delete'
        },
        {
          label: tr('Select all'),
          accelerator: 'CmdOrCtrl+A',
          role: 'selectAll'
        }
      ]
    },
    {
      label: tr('Tools'),
      submenu: [
        {
          label: tr('Open directory'),
          submenu: [
            {
              label: tr('App directory'),
              click: () => shell.openPath(dataDir())
            },
            {
              label: tr('Working directory'),
              click: () => shell.openPath(mihomoWorkDir())
            },
            {
              label: tr('Core directory'),
              click: () => shell.openPath(mihomoCoreDir())
            },
            {
              label: tr('Log directory'),
              click: () => shell.openPath(logDir())
            }
          ]
        },
        { type: 'separator' },
        {
          label: tr('Reload'),
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.reload()
            }
          }
        },
        {
          label: tr('Developer tools'),
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools()
            }
          }
        }
      ]
    },
    {
      label: tr('Window'),
      submenu: [
        {
          label: tr('Minimize'),
          accelerator: 'CmdOrCtrl+M',
          role: 'minimize'
        },
        {
          label: tr('Close'),
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        },
        { type: 'separator' },
        {
          label: tr('Bring all to front'),
          role: 'front'
        }
      ]
    },
    {
      label: tr('Help'),
      submenu: [
        {
          label: tr('Learn more'),
          click: () => {
            shell.openExternal('https://github.com/amamiyakokoro/KokoroBox-Desktop')
          }
        },
        {
          label: tr('Report an issue'),
          click: () => {
            shell.openExternal('https://github.com/amamiyakokoro/KokoroBox-Desktop/issues')
          }
        },
        { type: 'separator' },
        {
          label: tr('About'),
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: tr('About KokoroBox'),
              message: 'KokoroBox',
              detail: tr('Version: {0}\nAn Electron-based proxy client', [app.getVersion()]),
              buttons: [tr('OK')]
            })
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

export async function updateApplicationMenu(): Promise<void> {
  if (process.platform === 'darwin') {
    await createApplicationMenu()
  }
}
