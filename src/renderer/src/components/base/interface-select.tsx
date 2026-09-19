import { tr } from '../../../../shared/i18n'
import React, { useEffect, useState } from 'react'
import { ListBox, Select } from '@heroui-v3/react'
import { getInterfaces } from '@renderer/utils/ipc'

const DISABLED_INTERFACE_KEY = '__disabled__'

const InterfaceSelect: React.FC<{
  value: string
  exclude?: string[]
  onChange: (iface: string) => void
}> = ({ value, onChange, exclude = [] }) => {
  const [ifaces, setIfaces] = useState<string[]>([])
  useEffect(() => {
    const fetchInterfaces = async (): Promise<void> => {
      const names = Object.keys(await getInterfaces())
      setIfaces(names.filter((name) => !exclude.includes(name)))
    }
    fetchInterfaces()
  }, [])

  return (
    <Select
      aria-label={tr('Network interface')}
      className="w-75"
      value={value || DISABLED_INTERFACE_KEY}
      variant="secondary"
      onChange={(key) => {
        if (Array.isArray(key) || key == null) return
        onChange(key === DISABLED_INTERFACE_KEY ? '' : String(key))
      }}
    >
      <Select.Trigger className="h-8 min-h-8 py-0">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id={DISABLED_INTERFACE_KEY} textValue={tr('Disable')}>
            {tr('Disable')}
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {ifaces.map((name) => (
            <ListBox.Item id={name} key={name} textValue={name}>
              {name}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

export default InterfaceSelect
