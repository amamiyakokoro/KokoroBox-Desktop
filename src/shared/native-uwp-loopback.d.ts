import 'kokorobox-native'

declare module 'kokorobox-native' {
  export interface UwpLoopbackApp {
    sid: string
    packageName: string
    displayName: string
    enabled: boolean
  }

  export function listUwpLoopbackApps(): UwpLoopbackApp[]
  export function setUwpLoopbackExemption(sid: string, enabled: boolean): void
}
