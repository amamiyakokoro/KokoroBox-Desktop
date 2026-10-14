import useSWR from 'swr'
import { getRuntimeRecoverySnapshot } from '@renderer/utils/ipc'

export function useRuntimeRecovery() {
  return useSWR('runtimeRecoverySnapshot', getRuntimeRecoverySnapshot, {
    refreshInterval: 15_000,
    errorRetryCount: 1
  })
}
