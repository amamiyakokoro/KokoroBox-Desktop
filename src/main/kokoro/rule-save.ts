interface RuleSaveDependencies {
  save: (revision: number, rules: KokoroCustomRuleInput[]) => Promise<KokoroRuleSet>
  getProfiles: () => Promise<ProfileConfig>
  refreshProfile: (id: string) => Promise<void>
}

// All entry points share this queue. Finish applying one saved revision before
// another save starts; refresh failures must not turn a successful rule write
// into a failed save (and cause duplicate writes or revision conflicts).
export function createKokoroRuleSaver(
  dependencies: RuleSaveDependencies
): (revision: number, rules: KokoroCustomRuleInput[]) => Promise<KokoroRuleSaveResult> {
  let queue: Promise<unknown> = Promise.resolve()
  return (revision, rules) => {
    const result = queue.then(async () => {
      const ruleSet = await dependencies.save(revision, rules)
      const subscriptionRefreshErrors: string[] = []
      try {
        const { items, current } = await dependencies.getProfiles()
        const profiles = items
          .filter((item) => item.type === 'remote' && item.kokoro)
          .sort((a, b) => Number(b.id === current) - Number(a.id === current))
        for (const item of profiles) {
          try {
            await dependencies.refreshProfile(item.id)
          } catch (error) {
            subscriptionRefreshErrors.push(
              `${item.name}: ${error instanceof Error ? error.message : String(error)}`
            )
          }
        }
      } catch (error) {
        subscriptionRefreshErrors.push(error instanceof Error ? error.message : String(error))
      }
      return { ruleSet, subscriptionRefreshErrors }
    })
    queue = result.catch(() => undefined)
    return result
  }
}
