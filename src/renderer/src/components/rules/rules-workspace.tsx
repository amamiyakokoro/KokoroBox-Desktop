import { tr } from '../../../../shared/i18n'
import { useNavigate } from 'react-router-dom'
import BasePage from '../base/base-page'
import { KokoTabs } from '../base/base-controls'
import RuleProvider from '../resources/rule-provider'
import RoutingRulesView from './routing-rules-view'

export type RulesWorkspaceView = 'routing' | 'collections'

interface Props {
  view: RulesWorkspaceView
}

const RulesWorkspace = ({ view }: Props): React.JSX.Element => {
  const navigate = useNavigate()

  return (
    <BasePage title={tr('Rules')} contentClassName="overflow-y-hidden">
      <div className="flex h-full min-h-0 flex-col">
        <nav
          aria-label={tr('Rules')}
          className="no-scrollbar min-h-9 shrink-0 overflow-x-auto px-2"
        >
          <KokoTabs
            ariaLabel={tr('Rules')}
            className="w-max max-w-none"
            density="toolbar"
            options={[
              { id: 'routing', label: tr('Routing rules') },
              { id: 'collections', label: tr('Rule collections') }
            ]}
            selectedKey={view}
            selectionStyle="accent-underline"
            variant="secondary"
            onChange={(key) => navigate(key === 'collections' ? '/resources' : '/rules')}
          />
        </nav>
        <div className="min-h-0 flex-1">
          {view === 'routing' ? <RoutingRulesView /> : <RuleProvider />}
        </div>
      </div>
    </BasePage>
  )
}

export default RulesWorkspace
