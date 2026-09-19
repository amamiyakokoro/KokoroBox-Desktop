import { tr } from '../../../../shared/i18n'
import {
  KokoButton as Button,
  KokoSwitch as Switch,
  KokoTextField as Input,
  KokoTooltip as Tooltip
} from '../base/koko-form'
import React, { useEffect, useRef, useState } from 'react'
import { BiCopy, BiHide, BiShow } from 'react-icons/bi'
import { IoIosHelpCircle } from 'react-icons/io'
import { LuArrowRight, LuRefreshCw } from 'react-icons/lu'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  ageIdentityToRecipient,
  generateAgeKeyPair,
  getGistRawUrl,
  getUserAgent
} from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import debounce from '@renderer/utils/debounce'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'

type IntegrationSection = 'subscription' | 'gist'

interface Props {
  sections?: IntegrationSection[]
}

const SubscriptionIntegrationSettings: React.FC<Props> = ({
  sections = ['subscription', 'gist']
}) => {
  const hasSubscriptionSection = sections.includes('subscription')
  const hasGistSection = sections.includes('gist')
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    userAgent,
    diffWorkDir = false,
    githubToken = '',
    gistSyncEnabled = githubToken !== '',
    gistEncrypted = false,
    gistAgeRecipient = '',
    gistAgeIdentity = ''
  } = appConfig || {}

  const [ua, setUa] = useState(userAgent ?? '')
  const [defaultUserAgent, setDefaultUserAgent] = useState('')
  const [gistAgeIdentityVisible, setGistAgeIdentityVisible] = useState(false)
  const userAgentFetched = useRef(false)
  const setUaDebounce = useRef(
    debounce((value: string) => {
      patchAppConfig({ userAgent: value })
    }, 500)
  ).current

  useEffect(() => {
    if (!hasSubscriptionSection) return
    if (userAgentFetched.current) return
    userAgentFetched.current = true
    getUserAgent().then(setDefaultUserAgent)
  }, [hasSubscriptionSection])

  useEffect(() => {
    if (!hasSubscriptionSection) return
    setUa(userAgent ?? '')
  }, [hasSubscriptionSection, userAgent])

  const copyValue = async (value: string | undefined, title: string): Promise<void> => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    notify(title, { variant: 'success' })
  }

  const handleGenerateGistAgeKeyPair = async (): Promise<void> => {
    try {
      const keyPair = await generateAgeKeyPair()
      await patchAppConfig({
        gistAgeIdentity: keyPair.identity,
        gistAgeRecipient: keyPair.recipient
      })
      notify(tr('age keys generated'), { variant: 'success' })
    } catch (e) {
      notify(e, { variant: 'danger' })
    }
  }

  const handleDeriveGistAgeRecipient = async (): Promise<void> => {
    try {
      const recipient = await ageIdentityToRecipient(gistAgeIdentity)
      await patchAppConfig({ gistAgeRecipient: recipient })
      notify(tr('age public key generated'), { variant: 'success' })
    } catch (e) {
      notify(e, { variant: 'danger' })
    }
  }

  return (
    <>
      {hasSubscriptionSection && (
        <SettingCard header={tr('Subscription data')}>
          <SettingItem
            compatKey="legacy"
            title={tr('Use a separate working directory for each profile')}
            actions={
              <Tooltip
                content={tr(
                  'Save proxy selections separately when different profiles contain groups with the same name'
                )}
              >
                <Button aria-label={tr('Description')} isIconOnly size="sm" variant="light">
                  <IoIosHelpCircle className="text-lg" />
                </Button>
              </Tooltip>
            }
            divider
          >
            <Switch
              size="sm"
              aria-label={tr('Use a separate working directory for each profile')}
              isSelected={diffWorkDir}
              onValueChange={(value) => {
                patchAppConfig({ diffWorkDir: value })
              }}
            />
          </SettingItem>
          <SettingItem compatKey="legacy" title={tr('Subscription user agent')}>
            <Input
              size="sm"
              aria-label={tr('Subscription user agent')}
              data-setting-input="wide"
              value={ua}
              placeholder={tr('Default: {0}', [defaultUserAgent])}
              onValueChange={(value) => {
                setUa(value)
                setUaDebounce(value)
              }}
            />
          </SettingItem>
        </SettingCard>
      )}

      {hasGistSection && (
        <SettingCard header={tr('Gist synchronization')}>
          <SettingItem
            compatKey="legacy"
            title={tr('Sync runtime configuration to Gist')}
            actions={
              gistSyncEnabled && (
                <Button
                  aria-label={tr('Copy Gist URL')}
                  isIconOnly
                  size="sm"
                  variant="light"
                  onPress={async () => {
                    try {
                      const url = await getGistRawUrl()
                      if (!url) return
                      await navigator.clipboard.writeText(url)
                      notify(tr('Gist URL copied'), { variant: 'success' })
                    } catch (e) {
                      notify(e, { variant: 'danger' })
                    }
                  }}
                >
                  <BiCopy className="text-lg" />
                </Button>
              )
            }
            divider={gistSyncEnabled}
          >
            <Switch
              size="sm"
              aria-label={tr('Sync runtime configuration to Gist')}
              isSelected={gistSyncEnabled}
              onValueChange={(value) => {
                patchAppConfig({ gistSyncEnabled: value })
              }}
            />
          </SettingItem>
          {gistSyncEnabled && (
            <SettingItem
              compatKey="legacy"
              title={tr('Encrypt Gist configuration')}
              divider={gistEncrypted}
            >
              <Switch
                size="sm"
                aria-label={tr('Encrypt Gist configuration')}
                isSelected={gistEncrypted}
                onValueChange={(value) => {
                  patchAppConfig({ gistEncrypted: value })
                }}
              />
            </SettingItem>
          )}
          {gistSyncEnabled && gistEncrypted && (
            <SettingItem compatKey="legacy" title={tr('Gist age public key')} divider>
              <Input
                size="sm"
                aria-label={tr('Gist age public key')}
                data-setting-input="full"
                value={gistAgeRecipient}
                placeholder="age1..."
                onValueChange={(value) => {
                  patchAppConfig({ gistAgeRecipient: value.trim() || undefined })
                }}
                endContent={
                  <div className="flex items-center gap-1">
                    <Tooltip content={tr('Derive public key from private key')}>
                      <Button
                        aria-label={tr('Derive a public key from the Gist age private key')}
                        isIconOnly
                        size="sm"
                        variant="light"
                        onPress={handleDeriveGistAgeRecipient}
                      >
                        <LuArrowRight className="text-lg" />
                      </Button>
                    </Tooltip>
                    <Button
                      aria-label={tr('Copy Gist age public key')}
                      isIconOnly
                      size="sm"
                      variant="light"
                      onPress={() => copyValue(gistAgeRecipient, tr('age public key copied'))}
                    >
                      <BiCopy className="text-lg" />
                    </Button>
                  </div>
                }
              />
            </SettingItem>
          )}
          {gistSyncEnabled && gistEncrypted && (
            <SettingItem compatKey="legacy" title={tr('Gist age private key')}>
              <Input
                size="sm"
                aria-label={tr('Gist age private key')}
                data-setting-input="full"
                type={gistAgeIdentityVisible ? 'text' : 'password'}
                value={gistAgeIdentity}
                placeholder="AGE-SECRET-KEY-1..."
                onValueChange={(value) => {
                  patchAppConfig({ gistAgeIdentity: value.trim() || undefined })
                }}
                endContent={
                  <div className="flex items-center gap-1">
                    <Button
                      aria-label={tr('Generate Gist age private key')}
                      isIconOnly
                      size="sm"
                      variant="light"
                      onPress={handleGenerateGistAgeKeyPair}
                    >
                      <LuRefreshCw className="text-lg" />
                    </Button>
                    <Button
                      aria-label={tr('Copy Gist age private key')}
                      isIconOnly
                      size="sm"
                      variant="light"
                      onPress={() => copyValue(gistAgeIdentity, tr('age private key copied'))}
                    >
                      <BiCopy className="text-lg" />
                    </Button>
                    <Button
                      aria-label={
                        gistAgeIdentityVisible
                          ? tr('Hide Gist age private key')
                          : tr('Show Gist age private key')
                      }
                      isIconOnly
                      size="sm"
                      variant="light"
                      onPress={() => setGistAgeIdentityVisible((visible) => !visible)}
                    >
                      {gistAgeIdentityVisible ? (
                        <BiHide className="text-lg" />
                      ) : (
                        <BiShow className="text-lg" />
                      )}
                    </Button>
                  </div>
                }
              />
            </SettingItem>
          )}
        </SettingCard>
      )}
    </>
  )
}

export const SubscriptionDataSettings: React.FC = () => (
  <SubscriptionIntegrationSettings sections={['subscription']} />
)

export const GistIntegrationSettings: React.FC = () => (
  <SubscriptionIntegrationSettings sections={['gist']} />
)

export default SubscriptionIntegrationSettings
