import { Button, Modal } from '@heroui/react'
import { tr } from '../../../../shared/i18n'

export default function OverrideHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal>
      <Modal.Backdrop
        isOpen
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-xl">
            <Modal.Header>
              <Modal.Heading>{tr('Override help')}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="max-h-[65vh] space-y-5 overflow-y-auto text-sm">
              <section className="space-y-2">
                <h3 className="font-semibold">YAML</h3>
                <p>
                  {tr('YAML overrides merge objects; values and arrays replace the originals.')}
                </p>
                <p>
                  {tr(
                    'Use ! to replace a whole object. Prefix + to prepend array items; suffix + to append them.'
                  )}
                </p>
                <pre className="overflow-x-auto rounded-lg bg-surface-secondary p-3 font-mono text-xs leading-5 text-foreground select-text">
                  <code>
                    <span className="block">
                      <span className="text-accent">dns!</span>:
                    </span>
                    <span className="block">
                      {'  '}
                      <span className="text-accent">enable</span>:{' '}
                      <span className="text-warning-soft-foreground">false</span>
                    </span>
                    <span className="block">
                      <span className="text-accent">+rules</span>:
                    </span>
                    <span className="block">
                      {'  - '}
                      <span className="text-success">DOMAIN,example.com,DIRECT</span>
                    </span>
                  </code>
                </pre>
              </section>
              <section className="space-y-2">
                <h3 className="font-semibold">JavaScript</h3>
                <p>{tr('JavaScript uses main(config): change the configuration and return it.')}</p>
                <pre className="overflow-x-auto rounded-lg bg-surface-secondary p-3 font-mono text-xs leading-5 text-foreground select-text">
                  <code>
                    <span className="block">
                      <span className="text-accent">function</span> main(config) {'{'}
                    </span>
                    <span className="block">
                      {'  config.rules.'}
                      <span className="text-accent">unshift</span>
                      {'('}
                      <span className="text-success">{"'DOMAIN,example.com,DIRECT'"}</span>)
                    </span>
                    <span className="block">
                      {'  '}
                      <span className="text-accent">return</span> config
                    </span>
                    <span className="block">{'}'}</span>
                  </code>
                </pre>
              </section>
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
