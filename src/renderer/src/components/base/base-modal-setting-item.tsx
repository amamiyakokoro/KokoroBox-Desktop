import React from 'react'
import SettingItem, { type SettingItemProps } from './base-setting-item'

interface ModalSettingItemProps extends Omit<SettingItemProps, 'contentAlign' | 'variant'> {
  labelWidth?: 'narrow' | 'wide'
}

/** SettingItem layout adapter for compact edit modals. */
const ModalSettingItem: React.FC<ModalSettingItemProps> = ({
  labelWidth = 'wide',
  ...props
}) => (
  <div className={`modal-setting-item modal-setting-item--${labelWidth}`}>
    <SettingItem {...props} contentAlign="end" />
  </div>
)

export default ModalSettingItem
