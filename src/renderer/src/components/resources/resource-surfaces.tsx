import { Surface, cn } from '@heroui/react'
import type React from 'react'

interface ResourceSectionProps {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}

export const ResourceSection: React.FC<ResourceSectionProps> = ({
  title,
  description,
  action,
  children
}) => (
  <section className="resource-section">
    {title || description || action ? (
      <header className="resource-section__header">
        {title || description ? (
          <div className="min-w-0">
            {title ? (
              <h2 className="text-base font-semibold leading-6 text-foreground">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p>
            ) : null}
          </div>
        ) : null}
        {action ? <div className="ml-auto shrink-0">{action}</div> : null}
      </header>
    ) : null}
    <Surface className="resource-section__body">{children}</Surface>
  </section>
)

interface ResourceSettingRowProps {
  label: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  actions?: React.ReactNode
  contentAlign?: 'start' | 'end'
}

export const ResourceSettingRow: React.FC<ResourceSettingRowProps> = ({
  label,
  description,
  children,
  actions,
  contentAlign = 'start'
}) => (
  <div className={cn('resource-setting-row', actions && 'resource-setting-row--has-actions')}>
    <div className="resource-setting-row__label">
      <div
        className="truncate text-sm font-medium leading-5 text-foreground"
        title={typeof label === 'string' ? label : undefined}
      >
        {label}
      </div>
      {description ? (
        <div className="mt-0.5 text-xs leading-4 text-muted">{description}</div>
      ) : null}
    </div>
    <div
      className={cn(
        'resource-setting-row__content',
        contentAlign === 'end' && 'resource-setting-row__content--end'
      )}
    >
      {children}
    </div>
    {actions ? <div className="resource-setting-row__actions">{actions}</div> : null}
  </div>
)

interface ResourceProviderRowProps {
  name: string
  count?: React.ReactNode
  metadata: React.ReactNode
  metadataTitle?: string
  actions: React.ReactNode
  details?: React.ReactNode
}

export const ResourceProviderRow: React.FC<ResourceProviderRowProps> = ({
  name,
  count,
  metadata,
  metadataTitle,
  actions,
  details
}) => (
  <div className="resource-provider-row">
    <div className="min-w-0">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-sm font-medium leading-5 text-foreground" title={name}>
          {name}
        </span>
        {count ? (
          <span className="shrink-0 text-xs leading-4 text-muted tabular-nums">{count}</span>
        ) : null}
      </div>
      <div className="mt-0.5 truncate text-xs leading-4 text-muted" title={metadataTitle}>
        {metadata}
      </div>
    </div>
    <div className="resource-provider-row__actions">{actions}</div>
    {details ? <div className="resource-provider-row__details">{details}</div> : null}
  </div>
)
