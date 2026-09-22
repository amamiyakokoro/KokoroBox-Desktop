const linuxBypass = [
  'localhost',
  '.local',
  '127.0.0.1/8',
  '192.168.0.0/16',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '::1'
]

const macosBypass = [
  '127.0.0.1/8',
  '192.168.0.0/16',
  '10.0.0.0/8',
  '172.16.0.0/12',
  'localhost',
  '*.local',
  '*.crashlytics.com',
  '<local>'
]

const windowsBypass = [
  'localhost',
  '127.*',
  '192.168.*',
  '10.*',
  ...Array.from({ length: 16 }, (_, index) => `172.${index + 16}.*`),
  '<local>'
]

export function defaultSystemProxyBypass(platform: string): string[] {
  if (platform === 'linux') return [...linuxBypass]
  if (platform === 'darwin') return [...macosBypass]
  return [...windowsBypass]
}

export function normalizeProxyHost(input: string): string {
  const host = input.trim()
  if (!host) return '127.0.0.1'
  if (/[\s/@?#\\]/.test(host)) throw new Error('Invalid proxy host')

  const candidate = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  try {
    const url = new URL(`http://${candidate}`)
    if (url.username || url.password || url.port || url.pathname !== '/' || !url.hostname) {
      throw new Error('Invalid proxy host')
    }
    return url.hostname
  } catch {
    throw new Error('Invalid proxy host')
  }
}
