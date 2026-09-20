import { tr } from '../../../../shared/i18n'
import React, { useEffect, useState } from 'react'
import { getInterfaces } from '@renderer/utils/ipc'
import { KokoSelect } from './koko-form'

const DISABLED_INTERFACE_KEY = '__disabled__'

const InterfaceSelect: React.FC<{
  value: string
  exclude?: string[]
  onChange: (iface: string) => void
}> = ({ value, onChange, exclude = [] }) => {
  const [ifaces, setIfaces] = useState<string[]>([])
  useEffect(() => {
    const fetchInterfaces = async (): Promise<void> => {
      setIfaces(Object.keys(await getInterfaces()))
    }
    void fetchInterfaces()
  }, [])

  const excludedInterfaces = new Set(exclude)
  const options = [
    {
      id: DISABLED_INTERFACE_KEY,
      label: tr('Disable')
    },
    ...ifaces
      .filter((name) => !excludedInterfaces.has(name))
      .map((name) => ({ id: name, label: name }))
  ]

  return (
    <KokoSelect
      aria-label={tr('Network interface')}
      className="w-75 max-w-full"
      density="compact"
      disallowEmptySelection
      options={options}
      value={value || DISABLED_INTERFACE_KEY}
      variant="secondary"
      onChange={(key) => {
        onChange(key === DISABLED_INTERFACE_KEY ? '' : key)
      }}
    />
  )
}

export default InterfaceSelect
