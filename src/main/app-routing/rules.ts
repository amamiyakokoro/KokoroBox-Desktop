import { normalizeAppRoutingConfig, validateAppRoutingConfig } from '../../shared/app-routing'

export async function prepareAppRoutingConfig(config: AppRoutingConfig): Promise<AppRoutingConfig> {
  validateAppRoutingConfig(config)
  const prepared = normalizeAppRoutingConfig(config)
  validateAppRoutingConfig(prepared)
  return prepared
}
