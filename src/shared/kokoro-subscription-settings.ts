const supportedProtocols = new Set<KokoroProtocol>(['vmess', 'anytls', 'hysteria2'])

export function isKokoroProtocol(value: string): value is KokoroProtocol {
  return supportedProtocols.has(value as KokoroProtocol)
}

/** Restore remembered choices only while they remain available for this account. */
export function resolveKokoroSubscriptionSettings(
  options: KokoroSubscriptionOptions,
  saved?: Partial<KokoroSubscriptionSettings>
): KokoroSubscriptionSettings {
  const protocols = options.protocols.filter((item) => isKokoroProtocol(item.value))
  const protocol = [saved?.protocol, options.defaults.protocol].find((value) =>
    protocols.some((item) => item.value === value)
  ) as KokoroProtocol | undefined
  const selectedProtocol =
    protocol ?? (protocols[0]?.value as KokoroProtocol | undefined) ?? 'vmess'
  const plan =
    [saved?.plan, options.defaults.plan].find((value) =>
      options.plans.some((item) => item.name === value)
    ) ??
    options.plans[0]?.name ??
    null
  const supportedIsps = options.plans.find((item) => item.name === plan)?.supported_isps ?? []
  const isp =
    saved?.isp &&
    supportedIsps.includes(saved.isp) &&
    options.isps.some((item) => item.value === saved.isp)
      ? saved.isp
      : null
  const supportsDirect = protocols.find((item) => item.value === selectedProtocol)?.supports_direct
  const mode = saved?.mode ?? options.defaults.mode
  const ruleSource = [saved?.rule_source, options.defaults.rule_source].find(
    (value) => (value === 'origin' || value === 'mirror') && options.rule_sources.includes(value)
  ) as KokoroRuleSource | undefined
  const finalRoute = [saved?.final_route, options.defaults.final_route].find(
    (value) => (value === 'proxy' || value === 'direct') && options.final_routes.includes(value)
  ) as KokoroFinalRoute | undefined
  const updateHours = saved?.profile_update_hours
  return {
    format: 'mihomo',
    protocol: selectedProtocol,
    plan,
    isp,
    mode: supportsDirect && mode === 'direct' ? 'direct' : 'relay',
    rule_source: ruleSource ?? 'origin',
    final_route: finalRoute ?? 'proxy',
    rule_provider_auto_update:
      typeof saved?.rule_provider_auto_update === 'boolean'
        ? saved.rule_provider_auto_update
        : options.defaults.rule_provider_auto_update,
    profile_auto_update:
      typeof saved?.profile_auto_update === 'boolean'
        ? saved.profile_auto_update
        : options.defaults.profile_auto_update,
    profile_update_hours: Math.min(
      options.profile_update.max_hours,
      Math.max(
        options.profile_update.min_hours,
        typeof updateHours === 'number' && Number.isFinite(updateHours)
          ? updateHours
          : options.defaults.profile_update_hours
      )
    )
  }
}
