import { parentPort, workerData } from 'node:worker_threads'
import vm from 'node:vm'
import { parseYaml, stringifyYaml } from '../utils/yaml'
import { OVERRIDE_LOG_LIMIT } from './override-execution'

const port = parentPort!
let logBytes = 0
const format = (value: unknown): string => {
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack}`
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
const log = (level: string, args: unknown[]): void => {
  // Stop formatting and posting altogether after the cap, including log floods.
  if (logBytes >= OVERRIDE_LOG_LIMIT) return
  const text = Buffer.from(`[${level}] ${args.map(format).join(' ')}\n`)
    .subarray(0, OVERRIDE_LOG_LIMIT - logBytes)
    .toString()
  logBytes += Buffer.byteLength(text)
  port.postMessage({ type: 'log', text })
}

async function run(): Promise<void> {
  try {
    const context = vm.createContext({
      console: Object.freeze({
        log: (...args: unknown[]) => log('log', args),
        info: (...args: unknown[]) => log('info', args),
        error: (...args: unknown[]) => log('error', args),
        debug: (...args: unknown[]) => log('debug', args)
      }),
      fetch,
      yaml: { parse: parseYaml, stringify: stringifyYaml },
      b64d: (value: string) => Buffer.from(value, 'base64').toString('utf-8'),
      b64e: (value: Buffer | string) =>
        (Buffer.isBuffer(value) ? value : Buffer.from(String(value))).toString('base64'),
      Buffer
    })
    vm.runInContext(workerData.script, context)
    // Parse into the script's realm, preserving the existing profile/object semantics.
    const profile = await vm.runInContext(`main(${JSON.stringify(workerData.profile)})`, context)
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new Error('Script must return an object')
    }
    port.postMessage({ type: 'result', profile })
  } catch (error) {
    port.postMessage({
      type: 'result',
      error: error instanceof Error ? error.message : String(error)
    })
  }
}
void run()
