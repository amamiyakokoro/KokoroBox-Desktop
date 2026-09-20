import { tr } from '../../../../shared/i18n'
import { KokoTextField as Input } from '../base/koko-form'
import PendingFieldAction from '../base/base-pending-field-action'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import React, { KeyboardEvent, useState, useEffect } from 'react'
import { platform } from '@renderer/utils/init'
import { registerShortcut } from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'

const keyMap = {
  Backquote: '`',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Equal: '=',
  Minus: '-',
  Plus: 'PLUS',
  Period: '.',
  Quote: "'",
  Semicolon: ';',
  Slash: '/',
  Backspace: 'Backspace',
  CapsLock: 'Capslock',
  ContextMenu: 'Contextmenu',
  Space: 'Space',
  Tab: 'Tab',
  Convert: 'Convert',
  Delete: 'Delete',
  End: 'End',
  Help: 'Help',
  Home: 'Home',
  PageDown: 'Pagedown',
  PageUp: 'Pageup',
  Escape: 'Esc',
  PrintScreen: 'Printscreen',
  ScrollLock: 'Scrolllock',
  Pause: 'Pause',
  Insert: 'Insert',
  Suspend: 'Suspend'
}

const ShortcutConfig: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    showWindowShortcut = '',
    showFloatingWindowShortcut = '',
    triggerSysProxyShortcut = '',
    triggerTunShortcut = '',
    ruleModeShortcut = '',
    globalModeShortcut = '',
    directModeShortcut = '',
    quitWithoutCoreShortcut = '',
    restartAppShortcut = ''
  } = appConfig || {}

  const shortcuts = [
    [tr('Toggle window'), showWindowShortcut, 'showWindowShortcut'],
    [tr('Toggle floating window'), showFloatingWindowShortcut, 'showFloatingWindowShortcut'],
    [tr('Toggle system proxy'), triggerSysProxyShortcut, 'triggerSysProxyShortcut'],
    [tr('Toggle TUN mode'), triggerTunShortcut, 'triggerTunShortcut'],
    [tr('Switch to rule mode'), ruleModeShortcut, 'ruleModeShortcut'],
    [tr('Switch to global mode'), globalModeShortcut, 'globalModeShortcut'],
    [tr('Switch to direct mode'), directModeShortcut, 'directModeShortcut'],
    [tr('Quit and keep core running'), quitWithoutCoreShortcut, 'quitWithoutCoreShortcut'],
    [tr('Restart app'), restartAppShortcut, 'restartAppShortcut']
  ] as const

  return (
    <SettingCard
      header={tr('Keyboard shortcuts')}
      description={tr(
        'Click a shortcut field and press a new key combination. Press Backspace to clear it.'
      )}
    >
      {shortcuts.map(([title, value, action], index) => (
        <SettingItem
          key={action}
          contentAlign="end"
          title={title}
          divider={index < shortcuts.length - 1}
        >
          <ShortcutInput value={value} patchAppConfig={patchAppConfig} action={action} />
        </SettingItem>
      ))}
    </SettingCard>
  )
}

const ShortcutInput: React.FC<{
  value: string
  action: string
  patchAppConfig: (value: Partial<AppConfig>) => Promise<unknown>
}> = (props) => {
  const { value, action, patchAppConfig } = props
  const [inputValue, setInputValue] = useState(value)

  useEffect(() => {
    setInputValue(value)
  }, [value])

  const parseShortcut = (
    event: KeyboardEvent,
    setKey: { (value: React.SetStateAction<string>): void; (arg0: string): void }
  ): void => {
    event.preventDefault()
    let code = event.code
    const key = event.key
    if (code === 'Backspace') {
      setKey('')
    } else {
      let newValue = ''
      if (event.ctrlKey) {
        newValue = 'Ctrl'
      }
      if (event.shiftKey) {
        newValue = `${newValue}${newValue.length > 0 ? '+' : ''}Shift`
      }
      if (event.metaKey) {
        newValue = `${newValue}${newValue.length > 0 ? '+' : ''}${platform === 'darwin' ? 'Command' : 'Super'}`
      }
      if (event.altKey) {
        newValue = `${newValue}${newValue.length > 0 ? '+' : ''}Alt`
      }
      if (code.startsWith('Key')) {
        code = code.substring(3)
      } else if (code.startsWith('Digit')) {
        code = code.substring(5)
      } else if (code.startsWith('Arrow')) {
        code = code.substring(5)
      } else if (key.startsWith('Arrow')) {
        code = key.substring(5)
      } else if (code.startsWith('Intl')) {
        code = code.substring(4)
      } else if (code.startsWith('Numpad')) {
        if (key.length === 1) {
          code = 'Num' + code.substring(6)
        } else {
          code = key
        }
      } else if (/F\d+/.test(code)) {
        // f1-f12
      } else if (keyMap[code] !== undefined) {
        code = keyMap[code]
      } else {
        code = ''
      }
      setKey(`${newValue}${newValue.length > 0 && code.length > 0 ? '+' : ''}${code}`)
    }
  }
  return (
    <div className="flex min-w-0 items-center justify-end gap-2">
      <Input
        placeholder={tr('Click to record shortcut')}
        onKeyDown={(e: KeyboardEvent): void => {
          parseShortcut(e, setInputValue)
        }}
        size="sm"
        controlWidth="select"
        onClear={() => setInputValue('')}
        value={inputValue}
      />
      <PendingFieldAction
        isVisible={inputValue !== value}
        onPress={async () => {
          try {
            if (await registerShortcut(value, inputValue, action)) {
              await patchAppConfig({ [action]: inputValue })
              window.electron.ipcRenderer.send('updateTrayMenu')
            } else {
              notify(tr('Failed to register shortcut'), { variant: 'danger' })
            }
          } catch (e) {
            notify(tr('Failed to register shortcut: {0}', [e]), { variant: 'danger' })
          }
        }}
      />
    </div>
  )
}

export default ShortcutConfig
