import { Disclosure } from '@heroui/react'
import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

export default function SettingsAdvancedSection({
  title,
  settingIds,
  children
}: {
  title: string
  settingIds: string[]
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const [params] = useSearchParams()
  const targeted = settingIds.includes(params.get('setting') ?? '')

  return (
    <Disclosure isExpanded={expanded || targeted} onExpandedChange={setExpanded} className="py-2">
      <Disclosure.Heading>
        <Disclosure.Trigger className="flex min-h-10 w-full items-center gap-3 text-left text-sm font-medium text-foreground">
          <span className="min-w-0 flex-1">{title}</span>
          <Disclosure.Indicator className="text-muted" />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>{children}</Disclosure.Content>
    </Disclosure>
  )
}
