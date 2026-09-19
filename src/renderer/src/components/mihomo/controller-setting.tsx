import { tr } from '../../../../shared/i18n'
import React, { useEffect, useState } from 'react'
import { Button, Switch, Tooltip } from '@heroui/react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { KokoSelect, KokoTextField as Input } from '../base/koko-form'
import { mihomoUpgradeUI } from '@renderer/utils/ipc'
import EditableList from '../base/base-list-editor'
import { IoMdCloudDownload, IoMdRefresh } from 'react-icons/io'
import { HiExternalLink } from 'react-icons/hi'
import { AiOutlineEye, AiOutlineEyeInvisible } from 'react-icons/ai'
import { isValidListenAddress } from '@renderer/utils/validate'
import { notify } from '@renderer/utils/notification'

const emptyOrigins: string[] = []

interface ControllerSettingProps {
  config: Partial<MihomoConfig>
  onChange: (patch: Partial<MihomoConfig>) => void
  onValidationChange: (key: string, invalid: boolean) => void
}

const ControllerSetting: React.FC<ControllerSettingProps> = ({
  config,
  onChange,
  onValidationChange
}) => {
  const {
    'external-controller': externalController = '',
    'external-ui': externalUi = '',
    'external-ui-url': externalUiUrl = '',
    'external-controller-cors': externalControllerCors,
    secret
  } = config
  const {
    'allow-origins': allowOrigins = emptyOrigins,
    'allow-private-network': allowPrivateNetwork = true
  } = externalControllerCors || {}

  const initialAllowOrigins = allowOrigins.length == 1 && allowOrigins[0] == '*' ? [] : allowOrigins
  const [allowOriginsInput, setAllowOriginsInput] = useState(initialAllowOrigins)
  const [externalControllerInput, setExternalControllerInput] = useState(externalController)
  const [externalUiUrlInput, setExternalUiUrlInput] = useState(externalUiUrl)
  const [secretInput, setSecretInput] = useState(secret)
  const [enableExternalUi, setEnableExternalUi] = useState(externalUi == 'ui')
  const [upgrading, setUpgrading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [externalControllerError, setExternalControllerError] = useState<string | null>(() => {
    const r = isValidListenAddress(externalController)
    return r.ok ? null : (r.error ?? tr('Invalid format'))
  })

  useEffect(
    () =>
      setAllowOriginsInput(
        allowOrigins.length === 1 && allowOrigins[0] === '*' ? [] : allowOrigins
      ),
    [allowOrigins]
  )
  useEffect(() => setExternalControllerInput(externalController), [externalController])
  useEffect(() => setExternalUiUrlInput(externalUiUrl), [externalUiUrl])
  useEffect(() => setSecretInput(secret), [secret])
  useEffect(() => setEnableExternalUi(externalUi == 'ui'), [externalUi])

  const upgradeUI = async (): Promise<void> => {
    try {
      setUpgrading(true)
      await mihomoUpgradeUI()
      notify(tr('Dashboard updated'), { variant: 'success' })
    } catch (e) {
      notify(e, { variant: 'danger' })
    } finally {
      setUpgrading(false)
    }
  }
  const generateRandomString = (length: number): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }

  useEffect(() => {
    onValidationChange('external-controller', Boolean(externalControllerError))
    return () => onValidationChange('external-controller', false)
  }, [externalControllerError, onValidationChange])

  return (
    <SettingCard header={tr('External controller')}>
      <SettingItem title={tr('Listen address')} divider={externalController !== ''}>
        <Tooltip delay={0} isOpen={!!externalControllerError}>
          <Tooltip.Trigger className="inline-flex min-w-0">
            <Input
              size="sm"
              className={`w-50 ${externalControllerError ? 'border-red-500 ring-1 ring-red-500 rounded-lg' : ''}`}
              value={externalControllerInput}
              onValueChange={(v) => {
                setExternalControllerInput(v)
                const result = isValidListenAddress(v)
                const error = result.ok ? null : (result.error ?? tr('Invalid format'))
                setExternalControllerError(error)
                if (!error) onChange({ 'external-controller': v })
              }}
            />
          </Tooltip.Trigger>
          <Tooltip.Content
            className="bg-danger text-danger-foreground"
            placement="right"
            showArrow
            offset={10}
          >
            {externalControllerError}
          </Tooltip.Content>
        </Tooltip>
      </SettingItem>
      {externalController && externalController !== '' && (
        <>
          <SettingItem
            title={tr('Access key')}
            actions={
              <Button
                size="sm"
                isIconOnly
                variant="ghost"
                onPress={() => {
                  const value = generateRandomString(32)
                  setSecretInput(value)
                  onChange({ secret: value })
                }}
              >
                <IoMdRefresh className="text-lg" />
              </Button>
            }
            divider
          >
            <Input
              size="sm"
              type={showPassword ? 'text' : 'password'}
              className="w-50"
              value={secretInput}
              onValueChange={(value) => {
                setSecretInput(value)
                onChange({ secret: value })
              }}
              startContent={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? (
                    <AiOutlineEyeInvisible className="w-4 h-4" />
                  ) : (
                    <AiOutlineEye className="w-4 h-4" />
                  )}
                </button>
              }
            />
          </SettingItem>
          <SettingItem title={tr('Enable controller dashboard')} divider>
            <Switch
              size="sm"
              isSelected={enableExternalUi}
              onChange={(v) => {
                setEnableExternalUi(v)
                onChange({
                  'external-ui': v ? 'ui' : undefined
                })
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </SettingItem>
          {enableExternalUi && (
            <SettingItem
              title={tr('Controller dashboard')}
              actions={
                <>
                  <Button
                    size="sm"
                    isIconOnly
                    variant="ghost"
                    isPending={upgrading}
                    onPress={upgradeUI}
                  >
                    <IoMdCloudDownload className="text-lg" />
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    className="app-nodrag"
                    variant="ghost"
                    onPress={() => {
                      const controller = externalController.startsWith(':')
                        ? `127.0.0.1${externalController}`
                        : externalController
                      const host = controller.split(':')[0]
                      const port = controller.split(':')[1]
                      if (
                        ['zashboard', 'metacubexd'].find((keyword) =>
                          externalUiUrl.includes(keyword)
                        )
                      ) {
                        open(
                          `http://${controller}/ui/#/setup?hostname=${host}&port=${port}&secret=${secret}`
                        )
                      } else if (externalUiUrl.includes('Razord')) {
                        open(
                          `http://${controller}/ui/#/proxies?host=${host}&port=${port}&secret=${secret}`
                        )
                      } else {
                        if (secret && secret.length > 0) {
                          open(
                            `http://${controller}/ui/?hostname=${host}&port=${port}&secret=${secret}`
                          )
                        } else {
                          open(`http://${controller}/ui/?hostname=${host}&port=${port}`)
                        }
                      }
                    }}
                  >
                    <HiExternalLink className="text-lg" />
                  </Button>
                </>
              }
              divider
            >
              <KokoSelect
                aria-label={tr('External UI source')}
                variant="secondary"
                className="w-37.5"
                value={externalUiUrlInput}
                options={[
                  {
                    id: 'https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip',
                    label: 'zashboard'
                  },
                  {
                    id: 'https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip',
                    label: 'metacubexd'
                  },
                  {
                    id: 'https://github.com/MetaCubeX/Yacd-meta/archive/refs/heads/gh-pages.zip',
                    label: 'yacd-meta'
                  },
                  {
                    id: 'https://github.com/haishanh/yacd/archive/refs/heads/gh-pages.zip',
                    label: 'yacd'
                  },
                  {
                    id: 'https://github.com/MetaCubeX/Razord-meta/archive/refs/heads/gh-pages.zip',
                    label: 'razord-meta'
                  }
                ]}
                disallowEmptySelection={true}
                onChange={(value) => {
                  setExternalUiUrlInput(value)
                  onChange({ 'external-ui-url': value })
                }}
              />
            </SettingItem>
          )}
          <SettingItem title={tr('CORS configuration')}></SettingItem>
          <div className="flex flex-col space-y-2 mt-2"></div>
          <SettingItem title={tr('Allow private network access')}>
            <Switch
              size="sm"
              isSelected={allowPrivateNetwork}
              onChange={(v) => {
                onChange({
                  'external-controller-cors': {
                    ...externalControllerCors,
                    'allow-private-network': v
                  }
                })
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </SettingItem>
          <div className="mt-1"></div>
          <SettingItem title={tr('Allowed origins')} />
          <EditableList
            items={allowOriginsInput}
            onChange={(items) => {
              const value = items as string[]
              setAllowOriginsInput(value)
              onChange({
                'external-controller-cors': {
                  ...externalControllerCors,
                  'allow-origins': value.length === 0 ? ['*'] : value
                }
              })
            }}
            divider={false}
          />
        </>
      )}
    </SettingCard>
  )
}

export default ControllerSetting
