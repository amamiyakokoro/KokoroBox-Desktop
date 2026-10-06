export interface CoreValidationOptions {
  executable: string
  configPath: string
  workDir: string
  safePaths: string[]
}
export interface CoreValidationResult {
  outcome: 'valid' | 'invalid' | 'timeout' | 'output-limit'
  output: string
}
export function validateCoreValidationResult(value: unknown): CoreValidationResult {
  const result = value as Partial<CoreValidationResult> | null
  if (
    !result ||
    !['valid', 'invalid', 'timeout', 'output-limit'].includes(result.outcome ?? '') ||
    typeof result.output !== 'string' ||
    result.output.length > 512 * 1024
  )
    throw new Error('Invalid core validation response')
  return { outcome: result.outcome!, output: result.output }
}
export function assertCoreProfileValid(value: CoreValidationResult): void {
  if (value.outcome === 'valid') return
  if (value.outcome === 'timeout') throw new Error('Core profile validation timed out')
  if (value.outcome === 'output-limit')
    throw new Error('Core profile validation output exceeded its limit')
  const errors = value.output
    .split('\n')
    .filter((line) => line.includes('level=error'))
    .map((line) => line.split('level=error', 2)[1]?.trim() || line.trim())
  throw new Error(errors.join('\n') || value.output.trim() || 'Core profile validation failed')
}

export interface ProfileValidationProviders {
  serviceAvailable: () => Promise<boolean>
  service: (options: CoreValidationOptions) => Promise<CoreValidationResult>
  native?: (options: CoreValidationOptions) => Promise<CoreValidationResult>
  legacy: (options: CoreValidationOptions) => Promise<CoreValidationResult>
}
export async function validateCoreProfileWithProviders(
  options: CoreValidationOptions,
  serviceMode: boolean,
  actions: ProfileValidationProviders
): Promise<void> {
  const result =
    serviceMode && (await actions.serviceAvailable())
      ? await actions.service(options)
      : actions.native
        ? await actions.native(options)
        : await actions.legacy(options)
  assertCoreProfileValid(validateCoreValidationResult(result))
}
