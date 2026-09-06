import { tr } from '../../../../shared/i18n'
import { Button, Chip, Input, Select, SelectItem, Tooltip } from '@heroui/react'
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
  if (rules.length > maxRules) return tr('规则数量超过当前限制')

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
      return tr('请选择可用的规则类型与目标')
    }
    if (
      !rule.target ||
      rule.target !== rule.target.trim() ||
      rule.target.length > 128 ||
      invalidText.test(rule.target)
    ) {
      return tr('请选择可用的规则类型与目标')
    }
    if (rule.type === 'MATCH') {
      matchCount += 1
      if (matchCount > 1 || index !== rules.length - 1 || rule.target === 'REJECT') {
        return tr('MATCH 规则只能有一条、必须位于最后，且不能使用 REJECT')
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
      return tr('规则内容不能为空，且不能包含逗号、首尾空格或控制字符')
    }
    if (rule.type === 'RULE-SET' && !domainProviders.has(rule.payload)) {
      return tr('请选择可用的 RULE-SET provider')
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
      notify(tr('Kokoro 默认规则集已保存'), { variant: 'success' })
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-default-100 bg-default-50/40 p-4">
      <div className="flex items-start justify-between gap-3 border-b border-default-100 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{tr('默认规则集')}</h3>
            {ruleSet && (
              <Chip size="sm" variant="flat">
                rev. {ruleSet.revision}
              </Chip>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-foreground-500">
            {tr('仅编辑应用于 Kokoro 配置的 default 规则集，规则将按此顺序执行。')}
          </p>
        </div>
        <Tooltip content={tr('重新加载')}>
          <Button
            size="sm"
            isIconOnly
            variant="light"
            isDisabled={loading || saving}
            onPress={() => void load()}
          >
            <LuRefreshCw className={loading ? 'animate-spin' : ''} />
          </Button>
        </Tooltip>
      </div>

      {loading ? (
        <div className="flex min-h-52 items-center justify-center">
          <LuRefreshCw className="animate-spin text-xl text-primary" />
        </div>
      ) : options && ruleSet ? (
        <>
          <div className="mt-3 flex max-h-[48vh] min-h-36 flex-col gap-2 overflow-y-auto pr-1 no-scrollbar">
            {rules.length === 0 && (
              <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-default-200 text-sm text-foreground-400">
                {tr('default 规则集目前为空')}
              </div>
            )}
            {rules.map((rule, index) => {
              const targetOptions = options.targets.filter(
                (target) => rule.type !== 'MATCH' || target !== 'REJECT'
              )
              return (
                <div key={index} className="rounded-lg bg-content1 p-2 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      aria-label={tr('规则类型')}
                      size="sm"
                      selectedKeys={new Set([rule.type])}
                      disallowEmptySelection
                      onSelectionChange={(value) =>
                        changeRuleType(index, String(value.currentKey) as KokoroCustomRuleType)
                      }
                    >
                      {options.rule_types.map((type) => (
                        <SelectItem
                          key={type}
                          isDisabled={type === 'MATCH' && hasMatch && rule.type !== 'MATCH'}
                        >
                          {type}
                        </SelectItem>
                      ))}
                    </Select>
                    <Select
                      aria-label={tr('规则目标')}
                      size="sm"
                      selectedKeys={new Set([rule.target])}
                      disallowEmptySelection
                      onSelectionChange={(value) =>
                        updateRule(index, { target: String(value.currentKey) })
                      }
                    >
                      {targetOptions.map((target) => (
                        <SelectItem key={target}>{target}</SelectItem>
                      ))}
                    </Select>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    {rule.type === 'RULE-SET' ? (
                      <Select
                        aria-label={tr('规则内容')}
                        className="min-w-0 flex-1"
                        size="sm"
                        placeholder={tr('选择 RULE-SET provider')}
                        selectedKeys={rule.payload ? new Set([rule.payload]) : new Set()}
                        onSelectionChange={(value) =>
                          updateRule(index, { payload: String(value.currentKey) })
                        }
                      >
                        {domainProviders.map((provider) => (
                          <SelectItem key={provider.name}>{provider.name}</SelectItem>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        aria-label={tr('规则内容')}
                        className="min-w-0 flex-1"
                        size="sm"
                        isDisabled={rule.type === 'MATCH'}
                        placeholder={
                          rule.type === 'MATCH' ? tr('MATCH 不需要规则内容') : tr('规则内容')
                        }
                        value={rule.payload || ''}
                        onValueChange={(value) => updateRule(index, { payload: value })}
                      />
                    )}
                    <Tooltip content={tr('上移')}>
                      <Button
                        size="sm"
                        isIconOnly
                        variant="light"
                        isDisabled={index === 0 || rule.type === 'MATCH'}
                        onPress={() => moveRule(index, -1)}
                      >
                        <LuArrowUp />
                      </Button>
                    </Tooltip>
                    <Tooltip content={tr('下移')}>
                      <Button
                        size="sm"
                        isIconOnly
                        variant="light"
                        isDisabled={
                          index === rules.length - 1 || rules[index + 1]?.type === 'MATCH'
                        }
                        onPress={() => moveRule(index, 1)}
                      >
                        <LuArrowDown />
                      </Button>
                    </Tooltip>
                    <Tooltip content={tr('删除')}>
                      <Button
                        size="sm"
                        isIconOnly
                        color="danger"
                        variant="light"
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
              )
            })}
          </div>

          <div className="mt-3 border-t border-default-100 pt-3">
            {(validationError || error) && (
              <p className="mb-2 text-xs leading-5 text-danger">{validationError || error}</p>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-foreground-400">
                {rules.length} / {maxRules}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="flat"
                  isDisabled={rules.length >= maxRules || options.rule_types.length === 0}
                  onPress={addRule}
                  startContent={<LuPlus />}
                >
                  {tr('新增规则')}
                </Button>
                <Button
                  size="sm"
                  color="primary"
                  isDisabled={!isDirty || Boolean(validationError)}
                  isLoading={saving}
                  onPress={() => void save()}
                  startContent={!saving ? <LuSave /> : undefined}
                >
                  {tr('保存规则')}
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-danger">{error || tr('Kokoro 规则集加载失败')}</p>
          <Button size="sm" variant="flat" onPress={() => void load()}>
            {tr('重新加载')}
          </Button>
        </div>
      )}
    </section>
  )
}

export default KokoroDefaultRules
