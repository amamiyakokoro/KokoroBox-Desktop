import { tr } from '../../../../shared/i18n'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import React from 'react'
import { MdManageAccounts } from 'react-icons/md'
import { useLocation, useNavigate } from 'react-router-dom'
import { SiderIconButton, SiderNavItem } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const KokoroSettingCard: React.FC<Props> = ({ iconOnly = false }) => {
  const { appConfig } = useAppConfig()
  const { kokoroCardStatus = 'col-span-2' } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/kokoro')
  if (iconOnly) {
    return (
      <div className={`${kokoroCardStatus} kokoro-setting-card flex justify-center`}>
        <SiderIconButton
          active={match}
          label={tr('Kokoro account and subscription')}
          placement="right"
          onPress={() => navigate('/kokoro')}
        >
          <MdManageAccounts className="text-[21px]" />
        </SiderIconButton>
      </div>
    )
  }

  return (
    <div className={`${kokoroCardStatus} kokoro-setting-card`}>
      <SiderNavItem
        icon={<MdManageAccounts />}
        title={tr('Kokoro account and subscription')}
        prominence="account"
        active={match}
        onPress={() => navigate('/kokoro')}
      />
    </div>
  )
}

export default KokoroSettingCard
