import { tr } from '../../../shared/i18n'
import BasePage from '@renderer/components/base/base-page'
import GeoData from '@renderer/components/resources/geo-data'
import ProxyProvider from '@renderer/components/resources/proxy-provider'
import RuleProvider from '@renderer/components/resources/rule-provider'
const Resources: React.FC = () => {
  return (
    <BasePage title={tr('External resources')}>
      <main className="resource-page mx-auto w-full max-w-[68rem] px-5 py-4">
        <GeoData />
        <ProxyProvider />
        <RuleProvider />
      </main>
    </BasePage>
  )
}

export default Resources
