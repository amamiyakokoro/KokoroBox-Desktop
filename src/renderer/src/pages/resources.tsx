import { tr } from '../../../shared/i18n'
import BasePage from '@renderer/components/base/base-page'
import RuleProvider from '@renderer/components/resources/rule-provider'
const Resources: React.FC = () => {
  return (
    <BasePage title={tr('Rule collections')}>
      <main className="resource-page mx-auto w-full max-w-[68rem] px-5 py-4">
        <RuleProvider />
      </main>
    </BasePage>
  )
}

export default Resources
