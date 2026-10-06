interface DnsLeaseActions {
  acquire: () => Promise<void>
  renew: () => Promise<void>
  release: () => Promise<void>
  isMissingLease: (error: unknown) => boolean
  onError: (error: unknown) => void
  intervalMs?: number
}

/** Serialize lease mutations so a completed stop cannot be undone by stale recovery. */
export function createDnsLeaseController(actions: DnsLeaseActions) {
  let generation = 0
  let timer: NodeJS.Timeout | undefined
  let pending: Promise<void> = Promise.resolve()
  const enqueue = (task: () => Promise<void>): Promise<void> => {
    const result = pending.then(task)
    pending = result.catch(() => {})
    return result
  }
  const invalidate = (): number => {
    if (timer) clearTimeout(timer)
    timer = undefined
    return ++generation
  }
  const schedule = (request: number): void => {
    if (request !== generation) return
    timer = setTimeout(() => {
      timer = undefined
      void renew(request).catch(actions.onError)
    }, actions.intervalMs ?? 20_000)
    timer.unref()
  }
  const renew = (request: number): Promise<void> =>
    enqueue(async () => {
      if (request !== generation) return
      try {
        await actions.renew()
      } catch (error) {
        if (request !== generation) return
        if (actions.isMissingLease(error)) await actions.acquire()
        else actions.onError(error)
      } finally {
        schedule(request)
      }
    })
  return {
    start(): Promise<void> {
      const request = invalidate()
      return enqueue(async () => {
        if (request !== generation) return
        await actions.acquire()
        schedule(request)
      })
    },
    stop(): Promise<void> {
      invalidate()
      return enqueue(actions.release)
    }
  }
}
