import * as native from 'kokorobox-native'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { getServiceMeta, validateServiceCoreProfile } from '../service/api'
import {
  validateCoreProfileWithProviders,
  type ProfileValidationProviders,
  type CoreValidationOptions,
  type CoreValidationResult
} from '../../shared/core-validation'

/** Bounded compatibility path until the new Native package is released. */
async function validateLegacy(options: CoreValidationOptions): Promise<CoreValidationResult> {
  try {
    const result = await promisify(execFile)(
      options.executable,
      ['-t', '-f', options.configPath, '-d', options.workDir],
      {
        cwd: options.workDir,
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 256 * 1024,
        env: {
          ...process.env,
          SAFE_PATHS: options.safePaths.join(path.delimiter),
          CLASH_CONFIG_STRING: '',
          CLASH_CONFIG_FILE: '',
          CLASH_HOME_DIR: '',
          CLASH_POST_UP: '',
          CLASH_POST_DOWN: ''
        }
      }
    )
    return { outcome: 'valid', output: result.stdout + result.stderr }
  } catch (error) {
    const failure = error as {
      stdout?: string
      stderr?: string
      code?: string | number
      killed?: boolean
    }
    const output = ((failure.stdout ?? '') + (failure.stderr ?? '')).slice(0, 512 * 1024)
    if (failure.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
      return { outcome: 'output-limit', output }
    if (failure.killed) return { outcome: 'timeout', output }
    if (typeof failure.code === 'number') return { outcome: 'invalid', output }
    throw error
  }
}
const providers: ProfileValidationProviders = {
  serviceAvailable: async () => (await getServiceMeta()).capabilities.coreProfileValidation,
  service: validateServiceCoreProfile,
  native: (native as unknown as { validateCoreProfile?: ProfileValidationProviders['native'] })
    .validateCoreProfile,
  legacy: validateLegacy
}
export async function validateMihomoProfile(
  options: CoreValidationOptions,
  serviceMode: boolean,
  actions: ProfileValidationProviders = providers
): Promise<void> {
  await validateCoreProfileWithProviders(options, serviceMode, actions)
}
