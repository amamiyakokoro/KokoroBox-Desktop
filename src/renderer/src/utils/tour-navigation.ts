export interface TourPage {
  route: string
  readySelector: string
}

interface TourNavigationOptions {
  pages: readonly TourPage[]
  navigate: (route: string) => void | Promise<void>
  waitForPage: (page: TourPage, signal: AbortSignal) => Promise<boolean>
  showStep: (index: number, starting: boolean) => void
  close: () => void
  setPending: (pending: boolean) => void
}

/** Keep both navigation directions on the right page before highlighting a step. */
export function createTourNavigation(options: TourNavigationOptions) {
  let pending: AbortController | undefined

  const cancel = (): void => {
    pending?.abort()
    pending = undefined
  }

  const goTo = async (index: number, starting = false): Promise<boolean> => {
    if (pending) return false
    const page = options.pages[index]
    if (!page) {
      options.close()
      return false
    }

    const operation = new AbortController()
    pending = operation
    options.setPending(true)
    try {
      await options.navigate(page.route)
      if (operation.signal.aborted) return false
      const ready = await options.waitForPage(page, operation.signal)
      if (operation.signal.aborted) return false
      if (!ready) {
        options.close()
        return false
      }
      options.showStep(index, starting)
      return true
    } catch (error) {
      if (!operation.signal.aborted) options.close()
      throw error
    } finally {
      if (pending === operation) {
        pending = undefined
        options.setPending(false)
      }
    }
  }

  return { goTo, cancel }
}
