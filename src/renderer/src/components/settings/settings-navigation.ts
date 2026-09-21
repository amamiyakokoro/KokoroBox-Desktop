import {
  findSettingsEntry,
  legacyCategoryAliases,
  type SettingsCategory,
  type SettingsCategoryDefinition,
  type SettingsEntryDefinition,
  type SettingsPanelDefinition
} from './settings-registry'

export interface SettingsSelection {
  category: SettingsCategory
  requestedSetting: ReturnType<typeof findSettingsEntry>
  selected: SettingsCategoryDefinition
  selectedPanel?: SettingsPanelDefinition
  selectedPanels: SettingsPanelDefinition[]
}

export interface SettingsSearchResult {
  category: SettingsCategoryDefinition
  entry: SettingsEntryDefinition
  panelLabel?: string
}

export const resolveSettingsSelection = (
  categories: SettingsCategoryDefinition[],
  searchParams: URLSearchParams
): SettingsSelection => {
  const requestedCategory = searchParams.get('section')
  const requestedSetting = findSettingsEntry(categories, searchParams.get('setting'))
  const isSettingsCategory = (value: string | null): value is SettingsCategory =>
    categories.some((item) => item.key === value)
  const category: SettingsCategory = isSettingsCategory(requestedCategory)
    ? requestedCategory
    : requestedCategory
      ? (legacyCategoryAliases[requestedCategory] ?? 'general')
      : (requestedSetting?.category.key ?? 'general')
  const selected = categories.find((item) => item.key === category) ?? categories[0]
  const requestedPanel = searchParams.get('panel') ?? requestedSetting?.entry.panel
  const selectedPanels = selected.panels ?? []
  const selectedPanel =
    selectedPanels.find((panel) => panel.key === requestedPanel) ?? selectedPanels[0]

  return { category, requestedSetting, selected, selectedPanel, selectedPanels }
}

export const searchSettings = (
  categories: SettingsCategoryDefinition[],
  search: string
): SettingsSearchResult[] => {
  const normalizedSearch = search.trim().toLocaleLowerCase()
  if (!normalizedSearch) return []

  return categories.flatMap((category) =>
    category.entries
      .filter((entry) => {
        const panelLabel = category.panels?.find((panel) => panel.key === entry.panel)?.label
        const searchableText = [
          entry.label,
          entry.fallbackLabel,
          panelLabel,
          ...(entry.keywords ?? []),
          category.label
        ]
          .filter((value): value is string => Boolean(value))
          .join(' ')
          .toLocaleLowerCase()
        return searchableText.includes(normalizedSearch)
      })
      .map((entry) => ({
        category,
        entry,
        panelLabel: category.panels?.find((panel) => panel.key === entry.panel)?.label
      }))
  )
}
