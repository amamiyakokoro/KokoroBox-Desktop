import * as native from 'kokorobox-native'

export interface CoreProcessIdentity {
  pid: number
  executable: string
  started: string
}

export interface CoreProcessBridge {
  inspectCoreProcess?: (pid: number, executable: string) => Promise<CoreProcessIdentity | null>
  stopCoreProcess?: (identity: CoreProcessIdentity) => Promise<boolean>
}

const bridge = native as unknown as CoreProcessBridge

export function parseCoreProcessRecord(value: string): CoreProcessIdentity | number | null {
  const text = value.trim()
  if (/^[1-9]\d*$/.test(text)) {
    const pid = Number(text)
    return Number.isSafeInteger(pid) && pid <= 0x7fffffff ? pid : null
  }
  try {
    const record = JSON.parse(text) as Partial<CoreProcessIdentity>
    if (
      Number.isInteger(record.pid) &&
      record.pid! > 0 &&
      record.pid! <= 0x7fffffff &&
      typeof record.executable === 'string' &&
      record.executable.length > 0 &&
      typeof record.started === 'string' &&
      record.started.length > 0
    )
      return record as CoreProcessIdentity
  } catch {
    /* An invalid record is never a process target. */
  }
  return null
}

export async function captureCoreProcess(
  pid: number,
  executable: string,
  api: CoreProcessBridge = bridge
): Promise<CoreProcessIdentity | null> {
  return api.inspectCoreProcess ? api.inspectCoreProcess(pid, executable) : null
}

export async function stopRecordedCoreProcess(
  record: CoreProcessIdentity | number,
  executable: string,
  api: CoreProcessBridge = bridge
): Promise<boolean> {
  if (!api.inspectCoreProcess || !api.stopCoreProcess) {
    throw new Error('Update KokoroBox Native to safely stop a previously launched core.')
  }
  // Legacy PID records require executable/owner inspection before adoption.
  // New records additionally retain the original creation identity across restarts.
  const identity =
    typeof record === 'number' ? await api.inspectCoreProcess(record, executable) : record
  return identity ? api.stopCoreProcess(identity) : false
}
