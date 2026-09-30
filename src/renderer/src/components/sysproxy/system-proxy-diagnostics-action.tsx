import { Button } from '@heroui/react'
import React, { useState } from 'react'
import { tr } from '../../../../shared/i18n'
import SettingItem from '../base/base-setting-item'
import SystemProxyDiagnosticsModal from './system-proxy-diagnostics-modal'

const SystemProxyDiagnosticsAction: React.FC<{ divider?: boolean }> = ({ divider = false }) => {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && <SystemProxyDiagnosticsModal onClose={() => setOpen(false)} />}
      <SettingItem
        title={tr('System Proxy Diagnostics')}
        description={tr('Check system configuration, core runtime and actual proxy connectivity.')}
        divider={divider}
      >
        <Button size="sm" variant="secondary" onPress={() => setOpen(true)}>
          {tr('Run diagnostics')}
        </Button>
      </SettingItem>
    </>
  )
}

export default SystemProxyDiagnosticsAction
