import { useEffect, useState } from 'react'
import type { SysProxyOperationState } from '../../../shared/sysproxy-operation'
import { getSysProxyOperationState } from '../utils/ipc'

const initialState: SysProxyOperationState = {
  revision: 0,
  phase: 'idle',
  desired: null,
  confirmed: null
}

export function useSysProxyOperation(): SysProxyOperationState {
  const [state, setState] = useState<SysProxyOperationState>(initialState)
  useEffect(() => {
    const remove = window.electron.ipcRenderer.on(
      'sysProxyOperationUpdated',
      (_event, next: SysProxyOperationState) => {
        setState((current) => (next.revision >= current.revision ? next : current))
      }
    )
    void getSysProxyOperationState().then((next) => {
      setState((current) => (next.revision >= current.revision ? next : current))
    })
    return () => remove()
  }, [])
  return state
}
