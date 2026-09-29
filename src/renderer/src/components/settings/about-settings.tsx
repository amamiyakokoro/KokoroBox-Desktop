import { Button, Modal, Spinner } from '@heroui/react'
import { useState } from 'react'
import useSWR from 'swr'
import { tr } from '../../../../shared/i18n'
import { getAboutInfo, readAboutLicense } from '@renderer/utils/ipc'
import {
  APPLICATION_LICENSE_DOCUMENT,
  aboutComponents,
  licenseProjectForDocument,
  type AboutInfo
} from '../../../../shared/about'
import SettingItem from '../base/base-setting-item'
import Actions from './actions'
import { LicenseDocument } from './license-document'
import './license-document.css'

function LicenseDialog({
  id,
  title,
  documents,
  onOpenDocument,
  onClose
}: {
  id: string
  title: string
  documents: AboutInfo['documents']
  onOpenDocument: (document: AboutInfo['documents'][number]) => void
  onClose: () => void
}) {
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
            <Modal.Body className="max-h-[60vh] min-w-0 overflow-y-auto">
              {error ? (
                <div role="alert">
                  <p>{tr('Unable to load license information')}</p>
                  <Button onPress={() => void mutate()}>{tr('Retry')}</Button>
                </div>
              ) : (
                <LicenseDocument
                  text={data || ''}
                  name={documents.find((document) => document.id === id)?.name || title}
                  title={title}
                  documents={documents}
                  onOpenDocument={onOpenDocument}
                />
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

function LicenseRow({
  title,
  detail,
  onOpen
}: {
  title: string
  detail: string
  onOpen?: () => void
}) {
  return (
    <div className="flex items-center gap-4 border-b border-separator py-3">
      <div className="min-w-0 flex-1 select-text [overflow-wrap:anywhere]">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted">{detail}</p>
      </div>
      <Button
        size="sm"
        variant="tertiary"
        className="shrink-0"
        isDisabled={!onOpen}
        onPress={onOpen}
      >
        {tr('License')}
      </Button>
    </div>
  )
}

type AboutSection = 'versions' | 'dependencies'

function AboutDetailsDialog({ section, onClose }: { section: AboutSection; onClose: () => void }) {
  const { data, error, isLoading, mutate } = useSWR('about-info', getAboutInfo)
  const [document, setDocument] = useState<{ id: string; title: string }>()
  const [limit, setLimit] = useState(30)
  const dependencies = data?.dependencies || []
  const components = aboutComponents(data)
  const componentLicenseNames = new Set<string>(components.map((item) => item.documentName))
  const licenseDocuments = data?.documents || []
  const supplemental = new Map(licenseDocuments.map((item) => [item.name, item.id]))
  const standaloneLicenses = licenseDocuments
    .filter(
      (item) =>
        item.name !== APPLICATION_LICENSE_DOCUMENT.name && !componentLicenseNames.has(item.name)
    )
    .map((item) => ({ ...item, project: licenseProjectForDocument(item.name) }))
    .filter((item): item is typeof item & { project: string } => Boolean(item.project))
    .sort((a, b) => a.project.localeCompare(b.project))
  const thirdPartyNotices = licenseDocuments.find((item) => item.name === 'THIRD_PARTY_NOTICES.md')
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
                    : tr('Third-party dependencies')}
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
                    {components.map((item) => (
                      <LicenseRow
                        key={item.key}
                        title={item.name}
                        detail={`${item.version || tr('Unavailable')} · ${item.license}`}
                        onOpen={
                          item.document
                            ? () => setDocument({ id: item.document!.id, title: item.name })
                            : undefined
                        }
                      />
                    ))}
                  </>
                )}
                {section === 'dependencies' && (
                  <>
                    {!isLoading && !error && dependencies.length === 0 && (
                      <p className="text-sm text-muted">
                        {tr('No dependency information available')}
                      </p>
                    )}
                    {dependencies.slice(0, limit).map((item) => {
                      const supplementName = `${item.name.replace('/', '+')}@${item.version}.txt`
                      return (
                        <LicenseRow
                          key={`${item.name}@${item.version}`}
                          title={item.name}
                          detail={`${item.version} · ${item.license}`}
                          onOpen={() =>
                            setDocument({
                              id: supplemental.get(supplementName) || item.document,
                              title: `${item.name}@${item.version}`
                            })
                          }
                        />
                      )
                    })}
                    {dependencies.length > limit && (
                      <Button variant="secondary" onPress={() => setLimit(limit + 30)}>
                        {tr('Show more')}
                      </Button>
                    )}
                    {standaloneLicenses.length > 0 && (
                      <h3 className="mt-5 text-sm font-semibold">
                        {tr('Other third-party licenses')}
                      </h3>
                    )}
                    {standaloneLicenses.map((item) => (
                      <LicenseRow
                        key={item.id}
                        title={item.project}
                        detail={item.name}
                        onOpen={() => setDocument({ id: item.id, title: item.name })}
                      />
                    ))}
                    {thirdPartyNotices && (
                      <LicenseRow
                        title={tr('Third-party notices')}
                        detail="KokoroBox"
                        onOpen={() =>
                          setDocument({ id: thirdPartyNotices.id, title: thirdPartyNotices.name })
                        }
                      />
                    )}
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
          documents={licenseDocuments}
          onOpenDocument={(document) => setDocument({ id: document.id, title: document.name })}
          onClose={() => setDocument(undefined)}
        />
      )}
    </>
  )
}

export default function AboutSettings() {
  const [section, setSection] = useState<AboutSection>()
  const [applicationLicenseOpen, setApplicationLicenseOpen] = useState(false)
  const entries = [
    ['versions', tr('Component versions')],
    ['dependencies', tr('Third-party dependencies')]
  ] as const
  return (
    <>
      <Actions
        sections={['version', 'updates']}
        versionDetails={
          <>
            <SettingItem title={tr('Application license')} contentAlign="end" divider>
              <Button
                size="sm"
                variant="tertiary"
                aria-label={tr('Application license')}
                onPress={() => setApplicationLicenseOpen(true)}
              >
                GPL-3.0
              </Button>
            </SettingItem>
            {entries.map(([id, title], index) => (
              <SettingItem
                key={id}
                title={title}
                contentAlign="end"
                divider={index < entries.length - 1}
              >
                <Button
                  size="sm"
                  variant="tertiary"
                  aria-label={title}
                  onPress={() => setSection(id)}
                >
                  {tr('Open')}
                </Button>
              </SettingItem>
            ))}
          </>
        }
      />
      {section && <AboutDetailsDialog section={section} onClose={() => setSection(undefined)} />}
      {applicationLicenseOpen && (
        <LicenseDialog
          id={APPLICATION_LICENSE_DOCUMENT.id}
          title={`KokoroBox · ${tr('Application license')}`}
          documents={[APPLICATION_LICENSE_DOCUMENT]}
          onOpenDocument={() => setApplicationLicenseOpen(true)}
          onClose={() => setApplicationLicenseOpen(false)}
        />
      )}
    </>
  )
}
