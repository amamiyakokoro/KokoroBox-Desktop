/* eslint-disable react/prop-types */
import { useMemo } from 'react'
import { Virtuoso } from 'react-virtuoso'
import RuleItem from './rule-item'
import { useRules } from '@renderer/hooks/use-rules'
import { includesIgnoreCase } from '@renderer/utils/includes'

interface RoutingRulesViewProps {
  filter: string
}

const RoutingRulesView: React.FC<RoutingRulesViewProps> = ({ filter }) => {
  const { rules } = useRules()

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
    <div className="h-full min-h-0">
      <Virtuoso
        data={filteredRules}
        itemContent={(index, rule) => <RuleItem index={index} rule={rule} />}
      />
    </div>
  )
}

export default RoutingRulesView
