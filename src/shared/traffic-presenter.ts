export const trafficPresenterProtocolVersion = 1 as const

export type TrafficPresenterLayout = 'horizontal' | 'stacked'

export type TrafficPresenterCommand =
  | {
      version: typeof trafficPresenterProtocolVersion
      type: 'configure'
      visible: boolean
      layout: TrafficPresenterLayout
      theme: 'system' | 'light' | 'dark'
    }
  | {
      version: typeof trafficPresenterProtocolVersion
      type: 'traffic'
      up: number
      down: number
    }
  | {
      version: typeof trafficPresenterProtocolVersion
      type: 'unavailable'
    }
  | {
      version: typeof trafficPresenterProtocolVersion
      type: 'shutdown'
    }

export function encodeTrafficPresenterCommand(command: TrafficPresenterCommand): string {
  return `${JSON.stringify(command)}\n`
}

export function trafficPresenterLayout(platform: NodeJS.Platform): TrafficPresenterLayout {
  return platform === 'win32' ? 'stacked' : 'horizontal'
}

export function trafficPresenterTheme(
  platform: NodeJS.Platform,
  theme: {
    shouldUseDarkColors: boolean
    shouldUseDarkColorsForSystemIntegratedUI: boolean
  }
): 'dark' | 'light' {
  // Windows permits different themes for applications and the taskbar.
  const dark =
    platform === 'win32'
      ? theme.shouldUseDarkColorsForSystemIntegratedUI
      : theme.shouldUseDarkColors
  return dark ? 'dark' : 'light'
}
