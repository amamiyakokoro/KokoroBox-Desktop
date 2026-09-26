import { Button, Input, Modal, Spinner, TextField, Label } from '@heroui/react'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { tr } from '../../../../shared/i18n'
import { getAboutInfo, readAboutLicense } from '@renderer/utils/ipc'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import Actions from './actions'

function LicenseDialog({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const { data, error, isLoading, mutate } = useSWR(['about-license', id], () =>
    readAboutLicense(id)
  )
  return (
    <Modal>
      <Modal.Backdrop
        isOpen
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-3xl">
            <Modal.Header className="flex-row items-center gap-2">
              <Modal.Heading>{title}</Modal.Heading>
              {isLoading && <Spinner size="sm" aria-label={tr('Loading')} />}
            </Modal.Header>
            <Modal.Body>
              {error ? (
                <div role="alert">
                  <p>{tr('Unable to load license information')}</p>
                  <Button onPress={() => void mutate()}>{tr('Retry')}</Button>
                </div>
              ) : (
                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-xs select-text">
                  {data
                    ?.split('\n\n' + '='.repeat(80) + '\n\n')
                    .find((part) => part.startsWith(title + '\n')) || data}
                </pre>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button onPress={onClose}>{tr('Close')}</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

type AboutSection = 'versions' | 'dependencies' | 'licenses'

function AboutDetailsDialog({ section, onClose }: { section: AboutSection; onClose: () => void }) {
  const { data, error, isLoading, mutate } = useSWR('about-info', getAboutInfo)
  const [search, setSearch] = useState('')
  const [document, setDocument] = useState<{ id: string; title: string }>()
  const [limit, setLimit] = useState(30)
  useEffect(() => setLimit(30), [search])
  const dependencies =
    data?.dependencies.filter((item) =>
      `${item.name} ${item.version} ${item.license}`.toLowerCase().includes(search.toLowerCase())
    ) || []
  const versions = [
    ['KokoroBox Service', data?.service],
    ['KokoroBox Native', data?.native],
    ['ProxyBridge', data?.proxyBridge],
    ['sysproxy-go', data?.sysproxy],
    ['Electron', data?.electron],
    ['Chromium', data?.chromium],
    ['Node.js', data?.node]
  ] as const
  return (
    <>
      <Modal>
        <Modal.Backdrop
          isOpen
          onOpenChange={(open) => {
            if (!open) onClose()
          }}
        >
          <Modal.Container>
            <Modal.Dialog className="w-full max-w-3xl">
              <Modal.Header className="flex-row items-center gap-2">
                <Modal.Heading>
                  {section === 'versions'
                    ? tr('Component versions')
                    : section === 'dependencies'
                      ? tr('Third-party dependencies')
                      : tr('Licenses')}
                </Modal.Heading>
                {isLoading && <Spinner size="sm" aria-label={tr('Loading')} />}
              </Modal.Header>
              <Modal.Body className="max-h-[60vh] overflow-y-auto">
                {error && (
                  <div role="alert" className="mb-3 space-y-2">
                    <p>{tr('Unable to load version information')}</p>
                    <Button onPress={() => void mutate()}>{tr('Retry')}</Button>
                  </div>
                )}
                {section === 'versions' && (
                  <>
                    <p className="mb-3 text-sm text-muted">
                      {tr(
                        'Service shows the running version. Other components show the bundled version or source revision.'
                      )}
                    </p>
                    {versions.map(([name, value]) => (
                      <div
                        key={name}
                        className="grid grid-cols-2 items-start gap-4 border-b border-separator py-3 text-sm select-text"
                      >
                        <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
                        <span className="min-w-0 text-right text-muted [overflow-wrap:anywhere]">
                          {value || tr('Unavailable')}
                        </span>
                      </div>
                    ))}
                    <Button size="sm" variant="secondary" onPress={() => void mutate()}>
                      {tr('Refresh')}
                    </Button>
                  </>
                )}
                {section === 'dependencies' && (
                  <>
                    <TextField value={search} onChange={setSearch} className="mb-3">
                      <Label>{tr('Search dependencies')}</Label>
                      <Input />
                    </TextField>
                    {!isLoading && !error && dependencies.length === 0 && (
                      <p className="text-sm text-muted">
                        {tr('No dependency information available')}
                      </p>
                    )}
                    {dependencies.slice(0, limit).map((item) => (
                      <div
                        key={`${item.name}@${item.version}`}
                        className="flex items-center gap-4 border-b border-separator py-3"
                      >
                        <div className="min-w-0 flex-1 select-text [overflow-wrap:anywhere]">
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          <p className="mt-1 text-xs text-muted">
                            {item.version} · {item.license}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="tertiary"
                          className="shrink-0"
                          onPress={() =>
                            setDocument({
                              id: item.document,
                              title: `${item.name}@${item.version}`
                            })
                          }
                        >
                          {tr('License')}
                        </Button>
                      </div>
                    ))}
                    {dependencies.length > limit && (
                      <Button variant="secondary" onPress={() => setLimit(limit + 30)}>
                        {tr('Show more')}
                      </Button>
                    )}
                  </>
                )}
                {section === 'licenses' && (
                  <>
                    <p className="mb-3 text-sm text-muted">
                      {tr('Application license and third-party notices are available offline.')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {data?.documents.map((item) => (
                        <Button
                          key={item.id}
                          size="sm"
                          variant="secondary"
                          onPress={() => setDocument({ id: item.id, title: item.name })}
                        >
                          {item.name === 'LICENSE.KokoroBox'
                            ? tr('Application license')
                            : item.name === 'THIRD_PARTY_NOTICES.md'
                              ? tr('Third-party notices')
                              : item.name}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button onPress={onClose}>{tr('Close')}</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      {document && (
        <LicenseDialog
          id={document.id}
          title={document.title}
          onClose={() => setDocument(undefined)}
        />
      )}
    </>
  )
}

export default function AboutSettings() {
  const [section, setSection] = useState<AboutSection>()
  const entries = [
    ['versions', tr('Component versions')],
    ['dependencies', tr('Third-party dependencies')],
    ['licenses', tr('Licenses')]
  ] as const
  return (
    <>
      <Actions sections={['version', 'updates']} />
      <SettingCard>
        {entries.map(([id, title], index) => (
          <SettingItem
            key={id}
            title={title}
            contentAlign="end"
            divider={index < entries.length - 1}
          >
            <Button size="sm" variant="tertiary" aria-label={title} onPress={() => setSection(id)}>
              {tr('Open')}
            </Button>
          </SettingItem>
        ))}
      </SettingCard>
      {section && <AboutDetailsDialog section={section} onClose={() => setSection(undefined)} />}
    </>
  )
}
