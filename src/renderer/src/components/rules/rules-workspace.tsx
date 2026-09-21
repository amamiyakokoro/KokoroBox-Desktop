import { tr } from '../../../../shared/i18n'
import { Separator } from '@heroui/react'
import { useRuleProviders } from '@renderer/hooks/use-rule-providers'
import { useCallback, useState } from 'react'
import { LuRefreshCw } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import BasePage from '../base/base-page'
import { KokoTabs } from '../base/base-controls'
import { KokoSearchField } from '../base/koko-search-field'
import { KokoToolbar, KokoToolbarIconButton } from '../base/koko-toolbar'
import RuleProvider from '../resources/rule-provider'
import RoutingRulesView from './routing-rules-view'

export type RulesWorkspaceView = 'routing' | 'collections'

interface Props {
  view: RulesWorkspaceView
}

let rulesWorkspaceFilterCache = ''

const RulesWorkspace = ({ view }: Props): React.JSX.Element => {
  const navigate = useNavigate()
  const [filter, setFilterState] = useState(() => rulesWorkspaceFilterCache)
  const providersModel = useRuleProviders(view === 'collections')
  const searchLabel =
    view === 'routing' ? tr('Search routing rules') : tr('Search rule collections')
  const setFilter = useCallback((value: string): void => {
    rulesWorkspaceFilterCache = value
    setFilterState(value)
  }, [])

  return (
    <BasePage title={tr('Rules')} contentClassName="overflow-y-hidden">
      <div className="flex h-full min-h-0 flex-col">
        <div className="no-scrollbar shrink-0 overflow-x-auto">
          <KokoToolbar aria-label={tr('Rules')}>
            <KokoTabs
              ariaLabel={tr('Rules')}
              density="toolbar"
              options={[
                { id: 'routing', label: tr('Routing rules') },
                { id: 'collections', label: tr('Rule collections') }
              ]}
              selectedKey={view}
              variant="secondary"
              onChange={(key) => navigate(key === 'collections' ? '/resources' : '/rules')}
            />
            <KokoSearchField
              aria-label={searchLabel}
              className="min-w-36 flex-1"
              placeholder={searchLabel}
              value={filter}
              onClear={() => setFilter('')}
              onChangeValue={setFilter}
            />
            {view === 'collections' && (
              <KokoToolbarIconButton
                isDisabled={
                  providersModel.updatingAll ||
                  providersModel.updating.size > 0 ||
                  !providersModel.providers.length
                }
                label={tr('Update all')}
                onPress={providersModel.updateAll}
              >
                <LuRefreshCw
                  aria-hidden="true"
                  className={`text-base ${providersModel.updatingAll ? 'animate-spin' : ''}`}
                />
              </KokoToolbarIconButton>
            )}
          </KokoToolbar>
          <Separator />
        </div>
        <div className="min-h-0 flex-1">
          {view === 'routing' ? (
            <RoutingRulesView filter={filter} />
          ) : (
            <RuleProvider filter={filter} model={providersModel} />
          )}
        </div>
      </div>
    </BasePage>
  )
}

export default RulesWorkspace
