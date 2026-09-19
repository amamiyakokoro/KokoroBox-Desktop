import { tr } from '../../../shared/i18n'
import BasePage from '@renderer/components/base/base-page'
import RuleItem from '@renderer/components/rules/rule-item'
import { Virtuoso } from 'react-virtuoso'
import { useMemo, useState } from 'react'
import { Button, InputGroup, Separator } from '@heroui/react'
import { useRules } from '@renderer/hooks/use-rules'
import { includesIgnoreCase } from '@renderer/utils/includes'
import { LuX } from 'react-icons/lu'

const Rules: React.FC = () => {
  const { rules } = useRules()
  const [filter, setFilter] = useState('')

  const filteredRules = useMemo(() => {
    if (!rules) return []
    if (filter === '') return rules.rules
    return rules.rules.filter((rule) => {
      return (
        includesIgnoreCase(rule.payload, filter) ||
        includesIgnoreCase(rule.type, filter) ||
        includesIgnoreCase(rule.proxy, filter)
      )
    })
  }, [rules, filter])

  return (
    <BasePage title={tr('Routing rules')}>
      <div className="sticky top-0 z-40">
        <div className="flex p-2">
          <InputGroup fullWidth variant="secondary">
            <InputGroup.Input
              aria-label={tr('Filter')}
              value={filter}
              placeholder={tr('Filter')}
              onChange={(event) => setFilter(event.target.value)}
            />
            {filter ? (
              <InputGroup.Suffix>
                <Button
                  isIconOnly
                  aria-label={tr('Clear field')}
                  size="sm"
                  variant="ghost"
                  onPress={() => setFilter('')}
                >
                  <LuX />
                </Button>
              </InputGroup.Suffix>
            ) : null}
          </InputGroup>
        </div>
        <Separator />
      </div>
      <div className="h-[calc(100vh-100px)] mt-px">
        <Virtuoso
          data={filteredRules}
          itemContent={(i, rule) => <RuleItem index={i} rule={rule} />}
        />
      </div>
    </BasePage>
  )
}

export default Rules
