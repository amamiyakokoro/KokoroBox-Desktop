import { tr } from '../../../shared/i18n'
import {
  getApplicationPaths,
  getAppRoutingConfig,
  getAppRoutingIcon,
  getAppRoutingStatus,
  replaceAppRoutingConfig
} from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import { normalizeProcessPattern, validateAppRoutingRule } from '../../../shared/app-routing'
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useState } from 'react'

export function useAppRouting(): {
  config?: AppRoutingConfig
  status?: AppRoutingStatus
  saving: boolean
  supported: boolean
  icons: Record<string, string>
  save: (config: AppRoutingConfig) => Promise<boolean>
  addApplications: () => Promise<void>
  addPattern: (processPattern: string) => Promise<boolean>
  updateRule: (index: number, patch: Partial<AppRoutingRule>) => void
  moveRule: (index: number, offset: number) => void
  deleteRule: (id: string) => void
} {
  const [config, setConfig] = useState<AppRoutingConfig>()
  const [status, setStatus] = useState<AppRoutingStatus>()
  const [saving, setSaving] = useState(false)
  const [icons, setIcons] = useState<Record<string, string>>({})

  const load = useCallback(async (): Promise<void> => {
    try {
      const [nextConfig, nextStatus] = await Promise.all([
        getAppRoutingConfig(),
        getAppRoutingStatus()
      ])
      setConfig(nextConfig)
      setStatus(nextStatus)
    } catch (error) {
      notify(error, { variant: 'danger' })
    }
  }, [])

  useEffect(() => {
    void load()
    return window.electron.ipcRenderer.on(
      'app-routing-status-changed',
      (_event, nextStatus: AppRoutingStatus) => setStatus(nextStatus)
    )
  }, [load])

  useEffect(() => {
    if (!config) return
    for (const rule of config.rules) {
      if (!rule.sourcePath || icons[rule.id]) continue
      void getAppRoutingIcon(rule.sourcePath).then((icon) => {
        if (icon) setIcons((current) => ({ ...current, [rule.id]: icon }))
      })
    }
  }, [config, icons])

  const save = async (next: AppRoutingConfig): Promise<boolean> => {
    setSaving(true)
    setConfig(next)
    try {
      setConfig(await replaceAppRoutingConfig(next))
      setStatus(await getAppRoutingStatus())
      return true
    } catch (error) {
      notify(error, { variant: 'danger' })
      await load()
      return false
    } finally {
      setSaving(false)
    }
  }

  const addApplications = async (): Promise<void> => {
    if (!config) return
    const applications = await getApplicationPaths()
    if (!applications?.length) return
    const existingPatterns = new Set(config.rules.map((rule) => rule.processPattern.toLowerCase()))
    const additions: AppRoutingRule[] = []
    for (const application of applications) {
      const { executablePath, executableName, iconDataUrl } = application
      const processPattern = normalizeProcessPattern(executableName)
      if (!processPattern || existingPatterns.has(processPattern.toLowerCase())) continue
      existingPatterns.add(processPattern.toLowerCase())
      additions.push({
        id: nanoid(),
        processPattern,
        sourcePath: executablePath,
        action: config.defaultAction,
        protocol: config.defaultProtocol,
        enabled: true,
        priority: config.rules.length + additions.length + 1
      })
      if (iconDataUrl) {
        const id = additions.at(-1)?.id
        if (id) setIcons((current) => ({ ...current, [id]: iconDataUrl }))
      }
    }
    if (additions.length === 0) {
      notify(tr('所选应用程序已存在'), { variant: 'warning' })
      return
    }
    await save({ ...config, rules: [...config.rules, ...additions] })
  }

  const addPattern = async (value: string): Promise<boolean> => {
    if (!config) return false
    const processPattern = normalizeProcessPattern(value)
    if (
      config.rules.some(
        (rule) => rule.processPattern.toLowerCase() === processPattern.toLowerCase()
      )
    ) {
      notify(tr('应用程序匹配规则已存在'), { variant: 'warning' })
      return false
    }
    const nextRule: AppRoutingRule = {
      id: nanoid(),
      processPattern,
      action: config.defaultAction,
      protocol: config.defaultProtocol,
      enabled: true,
      priority: config.rules.length + 1
    }
    try {
      validateAppRoutingRule(nextRule)
    } catch (error) {
      notify(error, { variant: 'danger' })
      return false
    }
    return save({ ...config, rules: [...config.rules, nextRule] })
  }

  const updateRule = (index: number, patch: Partial<AppRoutingRule>): void => {
    if (!config) return
    void save({
      ...config,
      rules: config.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule
      )
    })
  }

  const moveRule = (index: number, offset: number): void => {
    if (!config) return
    const target = index + offset
    if (target < 0 || target >= config.rules.length) return
    const rules = [...config.rules]
    const [rule] = rules.splice(index, 1)
    rules.splice(target, 0, rule)
    void save({
      ...config,
      rules: rules.map((item, ruleIndex) => ({ ...item, priority: ruleIndex + 1 }))
    })
  }

  const deleteRule = (id: string): void => {
    if (!config) return
    void save({ ...config, rules: config.rules.filter((rule) => rule.id !== id) })
  }

  return {
    config,
    status,
    saving,
    supported: status?.supported ?? (window.api.platform === 'win32' && window.api.arch === 'x64'),
    icons,
    save,
    addApplications,
    addPattern,
    updateRule,
    moveRule,
    deleteRule
  }
}
