import { Button, Input, Label, Modal, TextField } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'
import { tr } from '../../../../shared/i18n'
import { KokoSelect } from '../base/koko-form'
import { getKokoroDefaultRules, replaceKokoroDefaultRules } from '@renderer/utils/ipc'
import { validateRules } from '@renderer/utils/kokoro-rule-validation'
import { notify } from '@renderer/utils/notification'
import {
  logDomain,
  logRulePayload,
  prependLogRule,
  type LogActionDetails,
  type LogRuleType
} from './log-actions'

export default function LogRuleModal({
  details,
  onClose
}: {
  details: LogActionDetails
  onClose: () => void
}) {
  const [data, setData] = useState<KokoroDefaultRules>()
  const [type, setType] = useState<LogRuleType>(details.domain ? 'DOMAIN-SUFFIX' : 'PROCESS-NAME')
  const [payload, setPayload] = useState(() =>
    logRulePayload(details, details.domain ? 'DOMAIN-SUFFIX' : 'PROCESS-NAME')
  )
  const [target, setTarget] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const mounted = useRef(true)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const next = await getKokoroDefaultRules()
      if (!mounted.current) return
      setData(next)
      setTarget((current) =>
        next.options.targets.includes(current)
          ? current
          : next.options.targets.find((value) => value === 'DIRECT') ||
            next.options.targets[0] ||
            ''
      )
    } catch (cause) {
      if (mounted.current) setError(String(cause instanceof Error ? cause.message : cause))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }
  useEffect(() => {
    mounted.current = true
    void load()
    return () => {
      mounted.current = false
    }
  }, [])

  const currentRules =
    data?.ruleSet.rules.map(({ type, payload, target }) => ({ type, payload, target })) || []
  const nextRules = prependLogRule(currentRules, { type, payload, target })
  const validation = data
    ? validateRules(nextRules, data.options) ||
      (type !== 'PROCESS-NAME' && !logDomain(payload)
        ? tr('Enter a domain name without a port or URL path')
        : null)
    : null

  const save = async () => {
    if (!data || validation || busy.current) return
    busy.current = true
    setSaving(true)
    setError('')
    try {
      await replaceKokoroDefaultRules(data.ruleSet.revision, nextRules)
      notify(tr('Kokoro default rule set saved'), { variant: 'success' })
      onClose()
    } catch (cause) {
      setError(String(cause instanceof Error ? cause.message : cause))
    } finally {
      busy.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return (
    <Modal>
      <Modal.Backdrop
        isOpen
        onOpenChange={(open) => {
          if (!open && !busy.current) onClose()
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-lg">
            <Modal.Header>
              <Modal.Heading>{tr('Add Kokoro rule')}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                {tr(
                  'Add to the top of the Kokoro default rule set. Refresh the Kokoro subscription to apply it.'
                )}
              </p>
              <KokoSelect
                aria-label={tr('Rule type')}
                label={tr('Rule type')}
                value={type}
                isDisabled={loading || saving}
                options={(['DOMAIN-SUFFIX', 'DOMAIN', 'PROCESS-NAME'] as const).map((id) => ({
                  id,
                  label: id,
                  isDisabled: !data?.options.rule_types.includes(id)
                }))}
                onChange={(value) => {
                  setType(value as typeof type)
                  setPayload(logRulePayload(details, value as LogRuleType))
                }}
              />
              <TextField isDisabled={loading || saving} value={payload} onChange={setPayload}>
                <Label>{tr('Rule content')}</Label>
                <Input />
              </TextField>
              <KokoSelect
                aria-label={tr('Rule target')}
                label={tr('Rule target')}
                value={target}
                isDisabled={loading || saving}
                options={(data?.options.targets || []).map((id) => ({ id, label: id }))}
                onChange={setTarget}
              />
              {loading && <p role="status">{tr('Loading')}</p>}
              {(error || validation) && (
                <p role="alert" className="break-words text-sm text-danger">
                  {error || validation}
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                isDisabled={loading || saving}
                onPress={() => void load()}
              >
                {tr('Reload')}
              </Button>
              <Button variant="secondary" isDisabled={saving} onPress={onClose}>
                {tr('Cancel')}
              </Button>
              <Button
                isDisabled={loading || saving || !data || !!validation}
                onPress={() => void save()}
              >
                {tr('Save')}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
