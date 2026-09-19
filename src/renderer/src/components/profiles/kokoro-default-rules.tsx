import { tr } from '../../../../shared/i18n'
import { Button, Chip, Input, Tooltip } from '@heroui/react'
import { KokoSelect } from '../base/koko-form'
import { getKokoroDefaultRules, replaceKokoroDefaultRules } from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { LuArrowDown, LuArrowUp, LuPlus, LuRefreshCw, LuSave, LuTrash2 } from 'react-icons/lu'

function editableRules(ruleSet: KokoroRuleSet): KokoroCustomRuleInput[] {
  return ruleSet.rules.map(({ type, payload, target }) => ({ type, payload, target }))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function optionLimit(options: KokoroCustomRulesOptions, names: string[], fallback: number): number {
  for (const name of names) {
    const value = options.limits[name]
    if (Number.isSafeInteger(value) && value > 0) return value
  }
  return fallback
}

function validateRules(
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

const KokoroDefaultRules: React.FC = () => {
  const [ruleSet, setRuleSet] = useState<KokoroRuleSet>()
  const [options, setOptions] = useState<KokoroCustomRulesOptions>()
  const [rules, setRules] = useState<KokoroCustomRuleInput[]>([])
  const [savedRules, setSavedRules] = useState<KokoroCustomRuleInput[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      const data = await getKokoroDefaultRules()
      const nextRules = editableRules(data.ruleSet)
      setRuleSet(data.ruleSet)
      setOptions(data.options)
      setRules(nextRules)
      setSavedRules(nextRules)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const validationError = useMemo(
    () => (options ? validateRules(rules, options) : null),
    [options, rules]
  )
  const isDirty = JSON.stringify(rules) !== JSON.stringify(savedRules)
  const hasMatch = rules.some((rule) => rule.type === 'MATCH')
  const domainProviders =
    options?.rule_providers.filter((provider) => provider.behavior === 'domain') || []
  const maxRules = options ? optionLimit(options, ['max_rules_per_set', 'rules_per_set'], 200) : 200

  const updateRule = (index: number, patch: Partial<KokoroCustomRuleInput>): void => {
    setRules((current) =>
      current.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...patch } : rule))
    )
  }

  const changeRuleType = (index: number, type: KokoroCustomRuleType): void => {
    setRules((current) => {
      const next = [...current]
      const previous = next[index]
      if (!previous) return current
      const allowedTargets = (options?.targets || []).filter(
        (target) => type !== 'MATCH' || target !== 'REJECT'
      )
      const updated: KokoroCustomRuleInput = {
        ...previous,
        type,
        payload:
          type === 'MATCH'
            ? null
            : type === 'RULE-SET'
              ? domainProviders[0]?.name || ''
              : previous.type === 'MATCH' || previous.type === 'RULE-SET'
                ? ''
                : previous.payload,
        target: allowedTargets.includes(previous.target) ? previous.target : allowedTargets[0] || ''
      }
      next[index] = updated
      if (type === 'MATCH' && index !== next.length - 1) {
        next.splice(index, 1)
        next.push(updated)
      }
      return next
    })
  }

  const moveRule = (index: number, offset: -1 | 1): void => {
    setRules((current) => {
      const destination = index + offset
      if (destination < 0 || destination >= current.length) return current
      const next = [...current]
      ;[next[index], next[destination]] = [next[destination], next[index]]
      return next
    })
  }

  const addRule = (): void => {
    if (!options || rules.length >= maxRules) return
    const type = options.rule_types.find((value) => value !== 'MATCH') || options.rule_types[0]
    const target = options.targets.find((value) => value === 'DIRECT') || options.targets[0]
    if (!type || !target) return
    const nextRule: KokoroCustomRuleInput = {
      type,
      payload: type === 'MATCH' ? null : '',
      target
    }
    setRules((current) => {
      const matchIndex = current.findIndex((rule) => rule.type === 'MATCH')
      if (matchIndex < 0) return [...current, nextRule]
      const next = [...current]
      next.splice(matchIndex, 0, nextRule)
      return next
    })
  }

  const save = async (): Promise<void> => {
    if (!ruleSet || validationError) return
    setSaving(true)
    setError(undefined)
    try {
      const nextRuleSet = await replaceKokoroDefaultRules(ruleSet.revision, rules)
      const nextRules = editableRules(nextRuleSet)
      setRuleSet(nextRuleSet)
      setRules(nextRules)
      setSavedRules(nextRules)
      notify(tr('Kokoro default rule set saved'), { variant: 'success' })
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-default-100 bg-content1/70">
      <header className="flex items-start justify-between gap-3 border-b border-default-100 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{tr('Default rule set')}</h3>
            {ruleSet && (
              <Chip size="sm" variant="flat" radius="sm" className="text-foreground-500">
                rev. {ruleSet.revision}
              </Chip>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-foreground-500">
            {tr('Edit only the default rule set used by Kokoro profiles. Rules run in this order.')}
          </p>
        </div>
        <Tooltip content={tr('Reload')}>
          <Button
            size="sm"
            isIconOnly
            variant="light"
            aria-label={tr('Reload')}
            isDisabled={loading || saving}
            onPress={() => void load()}
          >
            <LuRefreshCw className={loading ? 'animate-spin' : ''} />
          </Button>
        </Tooltip>
      </header>

      {loading ? (
        <div className="flex min-h-52 items-center justify-center">
          <LuRefreshCw className="animate-spin text-xl text-primary" />
        </div>
      ) : options && ruleSet ? (
        <>
          <div className="no-scrollbar flex max-h-[48vh] min-h-36 flex-col gap-2 overflow-y-auto px-3 py-3">
            {rules.length === 0 && (
              <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-default-200 text-sm text-foreground-400">
                {tr('The default rule set is empty')}
              </div>
            )}
            {rules.map((rule, index) => {
              const targetOptions = options.targets.filter(
                (target) => rule.type !== 'MATCH' || target !== 'REJECT'
              )
              return (
                <div
                  key={index}
                  className="rounded-lg border border-default-100 bg-default-50/50 p-2"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                    <KokoSelect
                      aria-label={tr('Rule type')}
                      variant="secondary"
                      label={tr('Rule type')}
                      labelPlacement="inside"
                      className="min-w-0"
                      disallowEmptySelection
                      options={options.rule_types.map((type) => ({
                        id: type,
                        label: type,
                        isDisabled: type === 'MATCH' && hasMatch && rule.type !== 'MATCH'
                      }))}
                      value={rule.type}
                      onChange={(value) => changeRuleType(index, value as KokoroCustomRuleType)}
                    />
                    <KokoSelect
                      aria-label={tr('Rule target')}
                      variant="secondary"
                      label={tr('Rule target')}
                      labelPlacement="inside"
                      className="min-w-0"
                      disallowEmptySelection
                      options={targetOptions.map((target) => ({ id: target, label: target }))}
                      value={rule.target}
                      onChange={(value) => updateRule(index, { target: value })}
                    />
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Tooltip content={tr('Move up')}>
                        <Button
                          size="sm"
                          isIconOnly
                          variant="light"
                          aria-label={tr('Move up')}
                          isDisabled={index === 0 || rule.type === 'MATCH'}
                          onPress={() => moveRule(index, -1)}
                        >
                          <LuArrowUp />
                        </Button>
                      </Tooltip>
                      <Tooltip content={tr('Move down')}>
                        <Button
                          size="sm"
                          isIconOnly
                          variant="light"
                          aria-label={tr('Move down')}
                          isDisabled={
                            index === rules.length - 1 || rules[index + 1]?.type === 'MATCH'
                          }
                          onPress={() => moveRule(index, 1)}
                        >
                          <LuArrowDown />
                        </Button>
                      </Tooltip>
                      <Tooltip content={tr('Delete')}>
                        <Button
                          size="sm"
                          isIconOnly
                          color="danger"
                          variant="light"
                          aria-label={tr('Delete')}
                          onPress={() =>
                            setRules((current) =>
                              current.filter((_, ruleIndex) => ruleIndex !== index)
                            )
                          }
                        >
                          <LuTrash2 />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="mt-2">
                    {rule.type === 'RULE-SET' ? (
                      <KokoSelect
                        aria-label={tr('Rule content')}
                        variant="secondary"
                        label={tr('Rule content')}
                        labelPlacement="inside"
                        className="min-w-0 flex-1"
                        placeholder={tr('Select a RULE-SET provider')}
                        options={domainProviders.map((provider) => ({
                          id: provider.name,
                          label: provider.name
                        }))}
                        value={rule.payload ?? ''}
                        onChange={(value) => updateRule(index, { payload: value })}
                      />
                    ) : (
                      <Input
                        aria-label={tr('Rule content')}
                        label={tr('Rule content')}
                        className="min-w-0 flex-1"
                        size="sm"
                        isDisabled={rule.type === 'MATCH'}
                        placeholder={
                          rule.type === 'MATCH'
                            ? tr('MATCH does not require rule content')
                            : tr('Rule content')
                        }
                        value={rule.payload || ''}
                        onValueChange={(value) => updateRule(index, { payload: value })}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <footer className="border-t border-default-100 px-4 py-3">
            {(validationError || error) && (
              <p className="mb-2 text-xs leading-5 text-danger">{validationError || error}</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 items-center gap-2" aria-live="polite">
                <span className="text-xs tabular-nums text-foreground-400">
                  {rules.length} / {maxRules}
                </span>
                {isDirty ? (
                  <span className="text-xs font-medium text-warning-600">
                    {tr('Unsaved changes')}
                  </span>
                ) : null}
              </div>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="flat"
                  isDisabled={rules.length >= maxRules || options.rule_types.length === 0}
                  onPress={addRule}
                  startContent={<LuPlus />}
                >
                  {tr('Add rule')}
                </Button>
                <Button
                  size="sm"
                  color="primary"
                  isDisabled={!isDirty || Boolean(validationError)}
                  isLoading={saving}
                  onPress={() => void save()}
                  startContent={!saving ? <LuSave /> : undefined}
                >
                  {tr('Save rules')}
                </Button>
              </div>
            </div>
          </footer>
        </>
      ) : (
        <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-danger">{error || tr('Failed to load the Kokoro rule set')}</p>
          <Button size="sm" variant="flat" onPress={() => void load()}>
            {tr('Reload')}
          </Button>
        </div>
      )}
    </section>
  )
}

export default KokoroDefaultRules
