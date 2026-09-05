import { isKokoroURI } from '../kokoro/oauth'

export function isAppDeepLink(value: string): boolean {
  return isKokoroURI(value) || /^(clash|mihomo|sparkle):\/\//.test(value)
}

// Call only after the single-instance lock has forwarded the original arguments.
// Do not retain OAuth codes in argv: elevation/relaunch helpers can serialize it.
export function takeInitialDeepLinks(argv: string[]): string[] {
  const links = argv.filter(isAppDeepLink)
  for (let index = argv.length - 1; index >= 0; index--) {
    if (isKokoroURI(argv[index])) argv.splice(index, 1)
  }
  return links
}

export function createDeepLinkInbox(
  handle: (url: string) => Promise<void>,
  onError: () => void
): { receive: (url: string) => void; start: () => void } {
  let ready = false
  const queued: string[] = []
  const dispatch = (url: string): void => {
    // Never expose raw callback URLs or transport errors in diagnostics.
    void handle(url).catch(onError)
  }
  return {
    receive(url) {
      if (!isAppDeepLink(url) || url.length > 8192) return
      if (ready) dispatch(url)
      else if (queued.length < 16) queued.push(url)
    },
    start() {
      ready = true
      for (const url of queued.splice(0)) dispatch(url)
    }
  }
}
