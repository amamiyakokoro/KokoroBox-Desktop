import { dialog, nativeImage } from 'electron'
import path from 'node:path'
import { tr } from '../../shared/i18n'
import { mainWindow } from '..'
import { defaultHomeBackgroundSettings, type HomeBackground } from '../../shared/home'
import { getAppConfig, patchAppConfig } from '../config/app'
import { dataDir } from '../utils/dirs'
import {
  importManagedHomeBackground,
  readManagedHomeBackground,
  removeManagedHomeBackground
} from './home-background-storage'

function homeBackgroundDirectory(): string {
  return path.join(dataDir(), 'backgrounds')
}

function networkCardBackgroundDirectory(): string {
  return path.join(dataDir(), 'network-card-backgrounds')
}

function notifyConfigUpdated(): void {
  mainWindow?.webContents.send('appConfigUpdated')
}

export async function chooseHomeBackground(): Promise<HomeBackground | undefined> {
  const selected = dialog.showOpenDialogSync({
    title: tr('Choose Home background image'),
    properties: ['openFile'],
    filters: [{ name: tr('Images'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  })?.[0]
  if (!selected) return undefined
  const config = await getAppConfig()
  const directory = homeBackgroundDirectory()
  const file = await importManagedHomeBackground(selected, directory, (bytes) => {
    if (nativeImage.createFromBuffer(bytes).isEmpty()) {
      throw new Error(tr('Failed to decode background image'))
    }
  })
  const previous = config.homeBackground
  const next: HomeBackground = {
    ...defaultHomeBackgroundSettings,
    ...previous,
    file
  }
  try {
    await patchAppConfig({ homeBackground: next, homeBackgroundDisabled: false })
  } catch (error) {
    await removeManagedHomeBackground(directory, file)
    throw error
  }
  await removeManagedHomeBackground(directory, previous?.file)
  notifyConfigUpdated()
  return next
}

export async function clearHomeBackground(disabled = false): Promise<void> {
  const previous = (await getAppConfig()).homeBackground
  await patchAppConfig({ homeBackground: undefined, homeBackgroundDisabled: disabled })
  await removeManagedHomeBackground(homeBackgroundDirectory(), previous?.file)
  notifyConfigUpdated()
}

export async function getHomeBackgroundDataUrl(): Promise<string | undefined> {
  const file = (await getAppConfig()).homeBackground?.file
  return readManagedHomeBackground(homeBackgroundDirectory(), file)
}

export async function chooseNetworkCardBackground(): Promise<string | undefined> {
  const selected = dialog.showOpenDialogSync({
    title: tr('Choose image'),
    properties: ['openFile'],
    filters: [{ name: tr('Images'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  })?.[0]
  if (!selected) return undefined
  const config = await getAppConfig()
  const directory = networkCardBackgroundDirectory()
  const file = await importManagedHomeBackground(selected, directory, (bytes) => {
    if (nativeImage.createFromBuffer(bytes).isEmpty()) {
      throw new Error(tr('Failed to decode background image'))
    }
  })
  try {
    await patchAppConfig({
      homeNetworkCardBackground: 'custom',
      homeNetworkCardBackgroundFile: file
    })
  } catch (error) {
    await removeManagedHomeBackground(directory, file)
    throw error
  }
  await removeManagedHomeBackground(directory, config.homeNetworkCardBackgroundFile)
  notifyConfigUpdated()
  return file
}

export async function clearNetworkCardBackground(): Promise<void> {
  const previous = (await getAppConfig()).homeNetworkCardBackgroundFile
  await patchAppConfig({
    homeNetworkCardBackground: 'none',
    homeNetworkCardBackgroundFile: undefined
  })
  await removeManagedHomeBackground(networkCardBackgroundDirectory(), previous)
  notifyConfigUpdated()
}

export async function getNetworkCardBackgroundDataUrl(): Promise<string | undefined> {
  const file = (await getAppConfig()).homeNetworkCardBackgroundFile
  return readManagedHomeBackground(networkCardBackgroundDirectory(), file)
}
