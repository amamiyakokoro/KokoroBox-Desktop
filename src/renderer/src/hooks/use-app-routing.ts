import { tr } from '../../../shared/i18n'
import {
  getApplicationPaths,
  getAppRoutingConfig,
  getAppRoutingIcon,
  getAppRoutingStatus,
  replaceAppRoutingConfig
} from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useState } from 'react'

export function useAppRouting(): {
  config?: AppRoutingConfig
  status?: AppRoutingStatus
  saving: boolean
  supported: boolean
  icons: Record<string, string>
  save: (config: AppRoutingConfig) => Promise<void>
  addApplications: () => Promise<void>
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
      if (icons[rule.executablePath]) continue
      void getAppRoutingIcon(rule.executablePath).then((icon) => {
        if (icon) setIcons((current) => ({ ...current, [rule.executablePath]: icon }))
      })
    }
  }, [config, icons])

  const save = async (next: AppRoutingConfig): Promise<void> => {
    setSaving(true)
    setConfig(next)
    try {
      setConfig(await replaceAppRoutingConfig(next))
      setStatus(await getAppRoutingStatus())
    } catch (error) {
      notify(error, { variant: 'danger' })
      await load()
    } finally {
      setSaving(false)
    }
  }

  const addApplications = async (): Promise<void> => {
    if (!config) return
    const applications = await getApplicationPaths()
    if (!applications?.length) return
    const existingPaths = new Set(config.rules.map((rule) => rule.executablePath.toLowerCase()))
    const additions: AppRoutingRule[] = []
    for (const application of applications) {
      const { executablePath, executableName, iconDataUrl } = application
      if (!executableName || existingPaths.has(executablePath.toLowerCase())) continue
      existingPaths.add(executablePath.toLowerCase())
      additions.push({
        id: nanoid(),
        executablePath,
        executableName,
        action: 'proxy',
        protocol: 'both',
        enabled: true,
        priority: config.rules.length + additions.length + 1
      })
      if (iconDataUrl) {
        setIcons((current) => ({ ...current, [executablePath]: iconDataUrl }))
      }
    }
    if (additions.length === 0) {
      notify(tr('所选应用程序已存在'), { variant: 'warning' })
      return
    }
    await save({ ...config, rules: [...config.rules, ...additions] })
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
    updateRule,
    moveRule,
    deleteRule
  }
}
