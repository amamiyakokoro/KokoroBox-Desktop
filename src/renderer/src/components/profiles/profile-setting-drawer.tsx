import { tr } from '../../../../shared/i18n'
import { Button, Drawer, Input, InputGroup, Switch, Tooltip } from '@heroui-v3/react'
import React, { useState, useEffect, useRef } from 'react'
import SettingItem from '../base/base-setting-item'
import { SettingTabs, settingItemProps } from '../base/base-controls'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  ageIdentityToRecipient,
  generateAgeKeyPair,
  getGistRawUrl,
  getUserAgent
} from '@renderer/utils/ipc'
import debounce from '@renderer/utils/debounce'
import { IoIosHelpCircle } from 'react-icons/io'
import { BiCopy, BiHide, BiShow } from 'react-icons/bi'
import { LuArrowRight, LuRefreshCw } from 'react-icons/lu'
import { notify } from '@renderer/utils/notification'

interface Props {
  onClose: () => void
  reopenSignal?: number
}

const DRAWER_CLOSE_ANIMATION_MS = 700

const ProfileSettingDrawer: React.FC<Props> = (props) => {
  const { onClose, reopenSignal } = props
  const { appConfig, patchAppConfig } = useAppConfig()

  const {
    profileDisplayDate = 'update',
    userAgent,
    diffWorkDir = false,
    githubToken = '',
    gistSyncEnabled = githubToken !== '',
    gistEncrypted = false,
    gistAgeRecipient = '',
    gistAgeIdentity = ''
  } = appConfig || {}

  const [ua, setUa] = useState(userAgent ?? '')
  const [gistAgeIdentityVisible, setGistAgeIdentityVisible] = useState(false)
  const [defaultUserAgent, setDefaultUserAgent] = useState<string>('')
  const userAgentFetched = useRef(false)
  const [isOpen, setIsOpen] = useState(true)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setUaDebounce = useRef(
    debounce((v: string) => {
      patchAppConfig({ userAgent: v })
    }, 500)
  ).current

  useEffect(() => {
    if (!userAgentFetched.current) {
      userAgentFetched.current = true
      getUserAgent().then((ua) => {
        setDefaultUserAgent(ua)
      })
    }
  }, [])

  useEffect(() => {
    setUa(userAgent ?? '')
  }, [userAgent])

  useEffect(() => {
    return () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setIsOpen(true)
  }, [reopenSignal])

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

  const closeWithAnimation = (): void => {
    if (closeTimer.current) return

    setIsOpen(false)
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      onClose()
    }, DRAWER_CLOSE_ANIMATION_MS)
  }

  return (
    <Drawer.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) closeWithAnimation()
      }}
      variant="blur"
      className="top-12 h-[calc(100%-48px)]"
    >
      <Drawer.Content placement="right" className="top-12 h-[calc(100%-48px)] p-3 pl-0">
        <Drawer.Dialog className="flex h-full w-[min(460px,calc(100vw-32px))] max-w-none flex-col overflow-hidden rounded-2xl! border border-separator/70 bg-overlay p-0 shadow-overlay flag-emoji">
          <Drawer.Header className="border-b border-separator/70 px-5 py-4">
            <Drawer.Heading className="text-base font-semibold">
              {tr('Subscription settings')}
            </Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body className="no-scrollbar flex-1 overflow-y-auto px-5 py-3">
            <div className="flex flex-col gap-1">
              <SettingItem title={tr('Show date')} {...settingItemProps} divider>
                <SettingTabs
                  ariaLabel={tr('Show date')}
                  selectedKey={profileDisplayDate}
                  options={[
                    { id: 'update', label: tr('Last updated') },
                    { id: 'expire', label: tr('Expiration') }
                  ]}
                  onChange={async (v) => {
                    await patchAppConfig({
                      profileDisplayDate: v as 'expire' | 'update'
                    })
                  }}
                />
              </SettingItem>
              <SettingItem
                title={tr('Use a separate working directory for each profile')}
                actions={
                  <Tooltip>
                    <Button aria-label={tr('Description')} isIconOnly size="sm" variant="ghost">
                      <IoIosHelpCircle className="text-lg" />
                    </Button>
                    <Tooltip.Content>
                      {tr(
                        'Save proxy selections separately when different profiles contain groups with the same name'
                      )}
                    </Tooltip.Content>
                  </Tooltip>
                }
                {...settingItemProps}
                divider
              >
                <Switch
                  aria-label={tr('Use a separate working directory for each profile')}
                  isSelected={diffWorkDir}
                  onChange={(v) => {
                    patchAppConfig({ diffWorkDir: v })
                  }}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </SettingItem>
              <SettingItem title={tr('Subscription user agent')} {...settingItemProps} divider>
                <Input
                  aria-label={tr('Subscription user agent')}
                  data-setting-input="wide"
                  value={ua}
                  placeholder={tr('Default: {0}', [defaultUserAgent])}
                  variant="secondary"
                  onChange={(event) => {
                    const v = event.target.value
                    setUa(v)
                    setUaDebounce(v)
                  }}
                />
              </SettingItem>
              <SettingItem
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
                          if (url !== '') {
                            await navigator.clipboard.writeText(url)
                            notify(tr('Gist URL copied'), { variant: 'success' })
                          }
                        } catch (e) {
                          notify(e, { variant: 'danger' })
                        }
                      }}
                    >
                      <BiCopy className="text-lg" />
                    </Button>
                  )
                }
                {...settingItemProps}
              >
                <Switch
                  aria-label={tr('Sync runtime configuration to Gist')}
                  isSelected={gistSyncEnabled}
                  onChange={(v) => {
                    patchAppConfig({ gistSyncEnabled: v })
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
                <SettingItem title={tr('Encrypt Gist configuration')} {...settingItemProps} divider>
                  <Switch
                    aria-label={tr('Encrypt Gist configuration')}
                    isSelected={gistEncrypted}
                    onChange={(v) => {
                      patchAppConfig({ gistEncrypted: v })
                    }}
                  >
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>
                </SettingItem>
              )}
              {gistSyncEnabled && gistEncrypted && (
                <SettingItem title={tr('Gist age public key')} {...settingItemProps} divider>
                  <InputGroup data-setting-input="full" variant="secondary">
                    <InputGroup.Input
                      aria-label={tr('Gist age public key')}
                      value={gistAgeRecipient}
                      placeholder="age1..."
                      onChange={(event) => {
                        patchAppConfig({
                          gistAgeRecipient: event.target.value.trim() || undefined
                        })
                      }}
                    />
                    <InputGroup.Suffix>
                      <Tooltip>
                        <Button
                          aria-label={tr('Derive a public key from the Gist age private key')}
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          onPress={handleDeriveGistAgeRecipient}
                        >
                          <LuArrowRight className="text-lg" />
                        </Button>
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
                    </InputGroup.Suffix>
                  </InputGroup>
                </SettingItem>
              )}
              {gistSyncEnabled && gistEncrypted && (
                <SettingItem title={tr('Gist age private key')} {...settingItemProps}>
                  <InputGroup data-setting-input="full" variant="secondary">
                    <InputGroup.Input
                      aria-label={tr('Gist age private key')}
                      type={gistAgeIdentityVisible ? 'text' : 'password'}
                      value={gistAgeIdentity}
                      placeholder="AGE-SECRET-KEY-1..."
                      onChange={(event) => {
                        patchAppConfig({
                          gistAgeIdentity: event.target.value.trim() || undefined
                        })
                      }}
                    />
                    <InputGroup.Suffix>
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
                    </InputGroup.Suffix>
                  </InputGroup>
                </SettingItem>
              )}
            </div>
          </Drawer.Body>
          <Drawer.CloseTrigger className="app-nodrag" />
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

export default ProfileSettingDrawer
