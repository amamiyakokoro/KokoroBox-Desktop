import { tr } from '../../../../shared/i18n'
import { useMemo, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { KokoSearchField } from '../base/koko-search-field'
import { KokoToolbar } from '../base/koko-toolbar'
import RuleItem from './rule-item'
import { useRules } from '@renderer/hooks/use-rules'
import { includesIgnoreCase } from '@renderer/utils/includes'

const RoutingRulesView: React.FC = () => {
  const { rules } = useRules()
  const [filter, setFilter] = useState('')

  const filteredRules = useMemo(() => {
    if (!rules) return []
    const query = filter.trim()
    if (!query) return rules.rules
    return rules.rules.filter(
      (rule) =>
        includesIgnoreCase(rule.payload, query) ||
        includesIgnoreCase(rule.type, query) ||
        includesIgnoreCase(rule.proxy, query)
    )
  }, [rules, filter])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <KokoToolbar aria-label={tr('Routing rules')} className="shrink-0 border-b border-separator">
        <KokoSearchField
          aria-label={tr('Search routing rules')}
          className="min-w-0 flex-1"
          placeholder={tr('Search routing rules')}
          value={filter}
          onClear={() => setFilter('')}
          onValueChange={setFilter}
        />
      </KokoToolbar>
      <div className="min-h-0 flex-1">
        <Virtuoso
          data={filteredRules}
          itemContent={(index, rule) => <RuleItem index={index} rule={rule} />}
        />
      </div>
    </div>
  )
}

export default RoutingRulesView
