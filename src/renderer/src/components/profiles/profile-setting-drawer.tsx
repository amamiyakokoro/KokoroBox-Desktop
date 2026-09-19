import { tr } from '../../../../shared/i18n'
/* eslint-disable react/prop-types */
import { Button } from '@heroui/react'
import { LuArrowRight } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import SettingItem from '../base/base-setting-item'
import { KokoSegmentedControl, settingItemProps } from '../base/base-controls'
import PageSettingsDrawer, { PageSettingsSection } from '../base/base-settings-drawer'

interface Props {
  onClose: () => void
  reopenSignal?: number
}

const ProfileSettingDrawer: React.FC<Props> = ({ onClose, reopenSignal }) => {
  const navigate = useNavigate()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { profileDisplayDate = 'update' } = appConfig || {}
  return (
    <PageSettingsDrawer
      title={tr('Subscription settings')}
      onClose={onClose}
      reopenSignal={reopenSignal}
    >
      <PageSettingsSection title={tr('Display')}>
        <SettingItem title={tr('Show date')} {...settingItemProps}>
          <KokoSegmentedControl
            ariaLabel={tr('Show date')}
            selectedKey={profileDisplayDate}
            options={[
              { id: 'update', label: tr('Last updated') },
              { id: 'expire', label: tr('Expiration') }
            ]}
            onChange={async (value) => {
              await patchAppConfig({
                profileDisplayDate: value as 'expire' | 'update'
              })
            }}
          />
        </SettingItem>
      </PageSettingsSection>

      <PageSettingsSection
        title={tr('Subscription data and sync')}
        description={tr(
          'Global subscription and Gist settings are managed in Application settings.'
        )}
      >
        <div className="px-1 pb-1">
          <Button
            size="sm"
            variant="secondary"
            onPress={() => {
              onClose()
              navigate('/settings?section=data')
            }}
          >
            <span>{tr('Open data and integrations')}</span>
            <LuArrowRight className="text-base" />
          </Button>
        </div>
      </PageSettingsSection>
    </PageSettingsDrawer>
  )
}

export default ProfileSettingDrawer
