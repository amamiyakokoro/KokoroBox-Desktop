import { tr } from '../../../shared/i18n'
import {
  getApplicationPaths,
  getAppRoutingConfig,
  getAppRoutingIcon,
  getAppRoutingStatus,
  refreshAppRoutingStatus,
  replaceAppRoutingConfig,
  scanAppRoutingDirectory
} from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import { normalizeAppRoutingIdentifier, validateAppRoutingRule } from '../../../shared/app-routing'
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useRef, useState } from 'react'

export function useAppRouting(): {
  config?: AppRoutingConfig
  status?: AppRoutingStatus
  saving: boolean
  supported: boolean
  icons: Record<string, string>
  refresh: () => Promise<void>
  save: (config: AppRoutingConfig) => Promise<boolean>
  addApplications: (groupId?: string) => Promise<void>
  scanDirectory: (groupId?: string) => Promise<void>
  createGroup: (name: string) => Promise<boolean>
  addPattern: (
    processPattern: string,
    identifierKind?: AppRoutingIdentifierKind
  ) => Promise<boolean>
  updateRule: (id: string, patch: Partial<AppRoutingRule>) => void
  updateGroup: (id: string, patch: Partial<AppRoutingRuleGroup>) => void
  renameGroup: (id: string, name: string) => Promise<boolean>
  deleteGroup: (id: string) => void
  moveRule: (id: string, offset: number) => void
  deleteRule: (id: string) => void
} {
  const [config, setConfig] = useState<AppRoutingConfig>()
  const [status, setStatus] = useState<AppRoutingStatus>()
  const [saving, setSaving] = useState(false)
  const [icons, setIcons] = useState<Record<string, string>>({})
  const requestedIcons = useRef(new Set<string>())

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
    const pending = config.rules.filter((rule) => {
      const requestKey = `${rule.id}:${rule.sourcePath}`
      if (!rule.sourcePath || icons[rule.id] || requestedIcons.current.has(requestKey)) return false
      requestedIcons.current.add(requestKey)
      return true
    })
    // A scanned folder can contain hundreds of applications. Resolve their
    // icons sequentially so Electron's shell integration is never flooded.
    void (async () => {
      for (const rule of pending) {
        try {
          const icon = await getAppRoutingIcon(rule.sourcePath!)
          if (icon) setIcons((current) => ({ ...current, [rule.id]: icon }))
        } catch {
          // The default icon remains available when an executable disappears.
        }
      }
    })()
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

  const refresh = async (): Promise<void> => {
    try {
      setStatus(await refreshAppRoutingStatus())
    } catch (error) {
      notify(error, { variant: 'danger' })
    }
  }

  const addApplications = async (groupId?: string): Promise<void> => {
    if (!config) return
    if (groupId && !config.groups?.some((group) => group.id === groupId)) return
    const applications = await getApplicationPaths()
    if (!applications?.length) return
    const existingPatterns = new Set(
      config.rules.map(
        (rule) =>
          `${rule.identifierKind ?? 'windows-executable'}:${rule.processPattern.toLowerCase()}`
      )
    )
    const additions: AppRoutingRule[] = []
    for (const application of applications) {
      const { executablePath, identifier, identifierKind, iconDataUrl } = application
      const processPattern = normalizeAppRoutingIdentifier(identifier, identifierKind)
      const patternKey = `${identifierKind}:${processPattern.toLowerCase()}`
      if (!processPattern || existingPatterns.has(patternKey)) continue
      existingPatterns.add(patternKey)
      additions.push({
        id: nanoid(),
        ...(groupId ? { groupId } : {}),
        processPattern,
        identifierKind,
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

  const scanDirectory = async (requestedGroupId?: string): Promise<void> => {
    if (!config || window.api.platform !== 'win32') return
    try {
      const requestedGroup = config.groups?.find((group) => group.id === requestedGroupId)
      const selection = await scanAppRoutingDirectory(requestedGroup?.sourceDirectory)
      if (!selection) return

      const matchingGroup = config.groups?.find(
        (group) => group.sourceDirectory?.toLowerCase() === selection.directoryPath.toLowerCase()
      )
      const group = requestedGroup ??
        matchingGroup ?? {
          id: nanoid(),
          name: selection.name,
          sourceDirectory: selection.directoryPath,
          enabled: true
        }
      if (!matchingGroup && !requestedGroup && (config.groups?.length ?? 0) >= 64) {
        notify(tr('应用程序规则组最多支持 64 个'), { variant: 'danger' })
        return
      }

      const existingPatterns = new Set(
        config.rules.map((rule) => rule.processPattern.toLowerCase())
      )
      const existingPaths = new Set(
        config.rules.flatMap((rule) => (rule.sourcePath ? [rule.sourcePath.toLowerCase()] : []))
      )
      const availableSlots = Math.max(0, 256 - config.rules.length)
      let patternBytes = config.rules.reduce(
        (total, rule) => total + new TextEncoder().encode(rule.processPattern).length + 1,
        0
      )
      const additions: AppRoutingRule[] = []
      for (const application of selection.applications) {
        const processPattern = normalizeAppRoutingIdentifier(
          application.identifier,
          application.identifierKind
        )
        const nextPatternBytes = new TextEncoder().encode(processPattern).length + 1
        if (
          additions.length >= availableSlots ||
          patternBytes + nextPatternBytes > 30000 ||
          existingPatterns.has(processPattern.toLowerCase()) ||
          existingPaths.has(application.executablePath.toLowerCase())
        ) {
          continue
        }
        existingPatterns.add(processPattern.toLowerCase())
        existingPaths.add(application.executablePath.toLowerCase())
        patternBytes += nextPatternBytes
        additions.push({
          id: nanoid(),
          groupId: group.id,
          processPattern,
          identifierKind: 'windows-executable',
          sourcePath: application.executablePath,
          action: config.defaultAction,
          protocol: config.defaultProtocol,
          enabled: true,
          priority: config.rules.length + additions.length + 1
        })
      }

      if (additions.length === 0) {
        const message =
          selection.applications.length === 0
            ? tr('所选文件夹中没有可添加的 .exe')
            : tr('所选文件夹中没有新的可添加 .exe')
        notify(message, { variant: 'warning' })
        return
      }
      const groups =
        matchingGroup || requestedGroup ? config.groups : [...(config.groups ?? []), group]
      if (await save({ ...config, groups, rules: [...config.rules, ...additions] })) {
        const partial =
          selection.truncated ||
          selection.unreadableDirectoryCount > 0 ||
          additions.length < selection.applications.length
        notify(tr('已从 {0} 添加 {1} 个应用程序', [selection.name, additions.length]), {
          body: partial ? tr('部分项目因重复、权限或规则数量限制未添加。') : undefined,
          variant: partial ? 'warning' : 'success'
        })
      }
    } catch (error) {
      notify(error, { variant: 'danger' })
    }
  }

  const addPattern = async (
    value: string,
    requestedIdentifierKind?: AppRoutingIdentifierKind
  ): Promise<boolean> => {
    if (!config) return false
    const identifierKind: AppRoutingIdentifierKind =
      requestedIdentifierKind ??
      (window.api.platform === 'darwin'
        ? 'macos-process-name'
        : window.api.platform === 'linux'
          ? 'linux-executable'
          : 'windows-executable')
    const processPattern = normalizeAppRoutingIdentifier(value, identifierKind)
    if (
      config.rules.some(
        (rule) =>
          (rule.identifierKind ?? 'windows-executable') === identifierKind &&
          rule.processPattern.toLowerCase() === processPattern.toLowerCase()
      )
    ) {
      notify(tr('应用程序匹配规则已存在'), { variant: 'warning' })
      return false
    }
    const nextRule: AppRoutingRule = {
      id: nanoid(),
      processPattern,
      identifierKind,
      ...(identifierKind === 'linux-executable' ? { sourcePath: processPattern } : {}),
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

  const createGroup = async (value: string): Promise<boolean> => {
    if (!config || window.api.platform !== 'win32') return false
    if ((config.groups?.length ?? 0) >= 64) {
      notify(tr('应用程序规则组最多支持 64 个'), { variant: 'danger' })
      return false
    }
    const name = value.trim()
    if (!name || name.length > 80 || /[\0\r\n]/.test(name)) {
      notify(tr('规则组名称不能为空且不能超过 80 个字符'), { variant: 'danger' })
      return false
    }
    return save({
      ...config,
      groups: [...(config.groups ?? []), { id: nanoid(), name, enabled: true }]
    })
  }

  const updateRule = (id: string, patch: Partial<AppRoutingRule>): void => {
    if (!config) return
    void save({
      ...config,
      rules: config.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule))
    })
  }

  const updateGroup = (id: string, patch: Partial<AppRoutingRuleGroup>): void => {
    if (!config?.groups) return
    void save({
      ...config,
      groups: config.groups.map((group) => (group.id === id ? { ...group, ...patch } : group))
    })
  }

  const renameGroup = async (id: string, value: string): Promise<boolean> => {
    if (!config?.groups?.some((group) => group.id === id)) return false
    const name = value.trim()
    if (!name || name.length > 80 || /[\0\r\n]/.test(name)) {
      notify(tr('规则组名称不能为空且不能超过 80 个字符'), { variant: 'danger' })
      return false
    }
    return save({
      ...config,
      groups: config.groups.map((group) => (group.id === id ? { ...group, name } : group))
    })
  }

  const deleteGroup = (id: string): void => {
    if (!config?.groups) return
    void save({
      ...config,
      groups: config.groups.filter((group) => group.id !== id),
      rules: config.rules.filter((rule) => rule.groupId !== id)
    })
  }

  const moveRule = (id: string, offset: number): void => {
    if (!config) return
    const index = config.rules.findIndex((rule) => rule.id === id)
    if (index < 0) return
    const groupId = config.rules[index].groupId
    const peerIndices = config.rules.flatMap((rule, ruleIndex) =>
      rule.groupId === groupId ? [ruleIndex] : []
    )
    const peerIndex = peerIndices.indexOf(index)
    const target = peerIndices[peerIndex + offset]
    if (target === undefined) return
    const rules = [...config.rules]
    ;[rules[index], rules[target]] = [rules[target], rules[index]]
    void save({
      ...config,
      rules: rules.map((item, ruleIndex) => ({ ...item, priority: ruleIndex + 1 }))
    })
  }

  const deleteRule = (id: string): void => {
    if (!config) return
    const deleted = config.rules.find((rule) => rule.id === id)
    const rules = config.rules.filter((rule) => rule.id !== id)
    const groups = deleted?.groupId
      ? config.groups?.filter(
          (group) =>
            group.id !== deleted.groupId ||
            group.sourceDirectory === undefined ||
            rules.some((rule) => rule.groupId === group.id)
        )
      : config.groups
    void save({ ...config, groups, rules })
  }

  return {
    config,
    status,
    saving,
    supported:
      status?.supported ??
      ((window.api.platform === 'win32' && window.api.arch === 'x64') ||
        (window.api.platform === 'darwin' && ['x64', 'arm64'].includes(window.api.arch))),
    icons,
    refresh,
    save,
    addApplications,
    scanDirectory,
    createGroup,
    addPattern,
    updateRule,
    updateGroup,
    renameGroup,
    deleteGroup,
    moveRule,
    deleteRule
  }
}
