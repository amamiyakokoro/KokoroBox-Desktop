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
          label: tr('关于 ') + app.getName(),
          role: 'about'
        },
        { type: 'separator' },
        {
          label: tr('隐藏') + app.getName(),
          accelerator: 'Command+H',
          role: 'hide'
        },
        {
          label: tr('隐藏其他'),
          accelerator: 'Command+Alt+H',
          role: 'hideOthers'
        },
        {
          label: tr('显示全部'),
          role: 'unhide'
        },
        { type: 'separator' },
        {
          label: tr('保留内核退出'),
          accelerator: quitWithoutCoreShortcut,
          click: () => {
            quitWithoutCore()
          }
        },
        {
          label: tr('重启应用'),
          accelerator: restartAppShortcut,
          click: () => {
            app.relaunch()
            app.quit()
          }
        },
        {
          label: tr('退出应用'),
          accelerator: 'Command+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: tr('编辑'),
      submenu: [
        {
          label: tr('撤销'),
          accelerator: 'CmdOrCtrl+Z',
          role: 'undo'
        },
        {
          label: tr('重做'),
          accelerator: 'Shift+CmdOrCtrl+Z',
          role: 'redo'
        },
        { type: 'separator' },
        {
          label: tr('剪切'),
          accelerator: 'CmdOrCtrl+X',
          role: 'cut'
        },
        {
          label: tr('复制'),
          accelerator: 'CmdOrCtrl+C',
          role: 'copy'
        },
        {
          label: tr('粘贴'),
          accelerator: 'CmdOrCtrl+V',
          role: 'paste'
        },
        {
          label: tr('删除'),
          accelerator: 'CmdOrCtrl+Backspace',
          role: 'delete'
        },
        {
          label: tr('全选'),
          accelerator: 'CmdOrCtrl+A',
          role: 'selectAll'
        }
      ]
    },
    {
      label: tr('工具'),
      submenu: [
        {
          label: tr('打开目录'),
          submenu: [
            {
              label: tr('应用目录'),
              click: () => shell.openPath(dataDir())
            },
            {
              label: tr('工作目录'),
              click: () => shell.openPath(mihomoWorkDir())
            },
            {
              label: tr('内核目录'),
              click: () => shell.openPath(mihomoCoreDir())
            },
            {
              label: tr('日志目录'),
              click: () => shell.openPath(logDir())
            }
          ]
        },
        { type: 'separator' },
        {
          label: tr('重新加载'),
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.reload()
            }
          }
        },
        {
          label: tr('开发者工具'),
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools()
            }
          }
        }
      ]
    },
    {
      label: tr('窗口'),
      submenu: [
        {
          label: tr('最小化'),
          accelerator: 'CmdOrCtrl+M',
          role: 'minimize'
        },
        {
          label: tr('关闭'),
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        },
        { type: 'separator' },
        {
          label: tr('前置所有窗口'),
          role: 'front'
        }
      ]
    },
    {
      label: tr('帮助'),
      submenu: [
        {
          label: tr('了解更多'),
          click: () => {
            shell.openExternal('https://github.com/amamiyakokoro/KokoroBox-Desktop')
          }
        },
        {
          label: tr('报告问题'),
          click: () => {
            shell.openExternal('https://github.com/amamiyakokoro/KokoroBox-Desktop/issues')
          }
        },
        { type: 'separator' },
        {
          label: tr('关于'),
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: tr('关于 KokoroBox'),
              message: 'KokoroBox',
              detail: tr('版本：{0}\n一个基于 Electron 的代理工具', [app.getVersion()]),
              buttons: [tr('确定')]
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
