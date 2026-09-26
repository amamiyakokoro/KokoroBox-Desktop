import { tr } from '../../../shared/i18n'

export function optionLimit(
  options: KokoroCustomRulesOptions,
  names: string[],
  fallback: number
): number {
  for (const name of names) {
    const value = options.limits[name]
    if (Number.isSafeInteger(value) && value > 0) return value
  }
  return fallback
}

export function validateRules(
  rules: KokoroCustomRuleInput[],
  options: KokoroCustomRulesOptions
): string | null {
  const maxRules = optionLimit(options, ['max_rules_per_set', 'rules_per_set'], 200)
  const maxPayload = optionLimit(options, ['max_payload_length', 'payload_length'], 1024)
  if (rules.length > maxRules) return tr('The current rule limit has been exceeded')

  const availableTypes = new Set(options.rule_types)
  const availableTargets = new Set(options.targets)
  const domainProviders = new Set(
    options.rule_providers
      .filter((provider) => provider.behavior === 'domain')
      .map((provider) => provider.name)
  )
  const invalidText = /[,\p{Cc}]/u
  let matchCount = 0

  for (const [index, rule] of rules.entries()) {
    if (!availableTypes.has(rule.type) || !availableTargets.has(rule.target)) {
      return tr('Select an available rule type and target')
    }
    if (
      !rule.target ||
      rule.target !== rule.target.trim() ||
      rule.target.length > 128 ||
      invalidText.test(rule.target)
    ) {
      return tr('Select an available rule type and target')
    }
    if (rule.type === 'MATCH') {
      matchCount += 1
      if (matchCount > 1 || index !== rules.length - 1 || rule.target === 'REJECT') {
        return tr('Only one MATCH rule is allowed; it must be last and cannot use REJECT')
      }
      continue
    }
    if (
      typeof rule.payload !== 'string' ||
      !rule.payload ||
      rule.payload !== rule.payload.trim() ||
      rule.payload.length > maxPayload ||
      invalidText.test(rule.payload)
    ) {
      return tr(
        'Rule content is required and cannot contain commas, surrounding spaces, or control characters'
      )
    }
    if (rule.type === 'RULE-SET' && !domainProviders.has(rule.payload)) {
      return tr('Select an available RULE-SET provider')
    }
  }
  return null
}
