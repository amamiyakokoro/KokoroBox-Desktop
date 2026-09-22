import { tr } from '../../../../shared/i18n'
import { Button, Switch, Tooltip } from '@heroui/react'
import { KokoTextField } from '../base/koko-form'
import React, { useEffect, useRef, useState } from 'react'
import { BiCopy, BiHide, BiShow } from 'react-icons/bi'
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
import SettingSubgroup from '../base/base-setting-subgroup'

type IntegrationSection = 'subscription' | 'gist'

interface Props {
  sections?: IntegrationSection[]
  showSubscriptionHeading?: boolean
}

const SubscriptionIntegrationSettings: React.FC<Props> = ({
  sections = ['subscription', 'gist'],
  showSubscriptionHeading = true
}) => {
  const hasSubscriptionSection = sections.includes('subscription')
  const hasGistSection = sections.includes('gist')
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    userAgent,
    diffWorkDir = false,
    gistSyncEnabled = false,
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
        <SettingCard header={showSubscriptionHeading ? tr('Subscription data') : undefined}>
          <SettingItem
            contentAlign="end"
            title={tr('Use a separate working directory for each profile')}
            help={tr(
              'Save proxy selections separately when different profiles contain groups with the same name'
            )}
            divider
          >
            <Switch
              size="sm"
              aria-label={tr('Use a separate working directory for each profile')}
              isSelected={diffWorkDir}
              onChange={(value) => {
                patchAppConfig({ diffWorkDir: value })
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </SettingItem>
          <SettingItem
            contentAlign="end"
            title={tr('Subscription user agent')}
            description={tr(
              'Leave empty to use the default user agent. Some providers return different content based on this value.'
            )}
          >
            <KokoTextField
              aria-label={tr('Subscription user agent')}
              controlWidth="full"
              value={ua}
              placeholder={tr('Default: {0}', [defaultUserAgent])}
              onChangeValue={(value) => {
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
            contentAlign="end"
            title={tr('Sync runtime configuration to Gist')}
            actions={
              gistSyncEnabled && (
                <Button
                  aria-label={tr('Copy Gist URL')}
                  isIconOnly
                  size="sm"
                  variant="ghost"
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
            divider={!gistSyncEnabled}
          >
            <Switch
              size="sm"
              aria-label={tr('Sync runtime configuration to Gist')}
              isSelected={gistSyncEnabled}
              onChange={(value) => {
                patchAppConfig({ gistSyncEnabled: value })
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </SettingItem>
          {gistSyncEnabled && (
            <SettingSubgroup label={tr('Sync runtime configuration to Gist')}>
              <SettingItem contentAlign="end" title={tr('Encrypt Gist configuration')}>
                <Switch
                  size="sm"
                  aria-label={tr('Encrypt Gist configuration')}
                  isSelected={gistEncrypted}
                  onChange={(value) => {
                    patchAppConfig({ gistEncrypted: value })
                  }}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </SettingItem>
              {gistEncrypted && (
                <SettingSubgroup label={tr('Encrypt Gist configuration')}>
                  <SettingItem
                    contentAlign="end"
                    title={tr('Gist age public key')}
                    description={tr('Used to encrypt synchronized configuration.')}
                    divider
                  >
                    <KokoTextField
                      aria-label={tr('Gist age public key')}
                      data-setting-input="full"
                      value={gistAgeRecipient}
                      placeholder="age1..."
                      onChangeValue={(value) => {
                        patchAppConfig({ gistAgeRecipient: value.trim() || undefined })
                      }}
                      suffix={
                        <div className="flex items-center gap-1">
                          <Tooltip delay={0}>
                            <Tooltip.Trigger>
                              <Button
                                aria-label={tr('Derive a public key from the Gist age private key')}
                                isIconOnly
                                size="sm"
                                variant="ghost"
                                onPress={handleDeriveGistAgeRecipient}
                              >
                                <LuArrowRight className="text-lg" />
                              </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content>
                              {tr('Derive public key from private key')}
                            </Tooltip.Content>
                          </Tooltip>
                          <Button
                            aria-label={tr('Copy Gist age public key')}
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            onPress={() => copyValue(gistAgeRecipient, tr('age public key copied'))}
                          >
                            <BiCopy className="text-lg" />
                          </Button>
                        </div>
                      }
                    />
                  </SettingItem>
                  <SettingItem
                    contentAlign="end"
                    title={tr('Gist age private key')}
                    description={tr(
                      'Required to decrypt synchronized configuration. Keep this key private.'
                    )}
                  >
                    <KokoTextField
                      aria-label={tr('Gist age private key')}
                      data-setting-input="full"
                      type={gistAgeIdentityVisible ? 'text' : 'password'}
                      value={gistAgeIdentity}
                      placeholder="AGE-SECRET-KEY-1..."
                      onChangeValue={(value) => {
                        patchAppConfig({ gistAgeIdentity: value.trim() || undefined })
                      }}
                      suffix={
                        <div className="flex items-center gap-1">
                          <Button
                            aria-label={tr('Generate Gist age private key')}
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            onPress={handleGenerateGistAgeKeyPair}
                          >
                            <LuRefreshCw className="text-lg" />
                          </Button>
                          <Button
                            aria-label={tr('Copy Gist age private key')}
                            isIconOnly
                            size="sm"
                            variant="ghost"
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
                            variant="ghost"
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
                </SettingSubgroup>
              )}
            </SettingSubgroup>
          )}
        </SettingCard>
      )}
    </>
  )
}

export const SubscriptionDataSettings: React.FC = () => (
  <SubscriptionIntegrationSettings sections={['subscription']} showSubscriptionHeading={false} />
)

export const GistIntegrationSettings: React.FC = () => (
  <SubscriptionIntegrationSettings sections={['gist']} />
)

export default SubscriptionIntegrationSettings
