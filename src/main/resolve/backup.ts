import { getAppConfig } from '../config'
import { getWebdavPassword } from '../config/webdav-password'
import dayjs from 'dayjs'
import { app, BrowserWindow, dialog } from 'electron'
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { dataDir } from '../utils/dirs'
import { tr } from '../../shared/i18n'
import { createBackupArchive, stageBackupRestore, validateBackupArchive } from './backup-archive'
import { setNotQuitDialog } from './appLifecycle'

const DEFAULT_WEBDAV_DIR = 'KokoroBox'

function backupFilename(): string {
  return `${process.platform}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.zip`
}

function checkRemoteFilename(filename: string): void {
  if (
    typeof filename !== 'string' ||
    !filename.endsWith('.zip') ||
    /[\\/]/.test(filename) ||
    filename.includes('\0')
  ) {
    throw new Error('Invalid backup filename')
  }
}

async function confirmRestore(buffer: Buffer, filename: string): Promise<boolean> {
  validateBackupArchive(buffer)
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    title: tr('Restore backup'),
    message: tr('Restore this backup?'),
    detail: `${filename}\n\n${tr('Current settings will be replaced and KokoroBox will restart.')}`,
    buttons: [tr('Cancel'), tr('Restore')],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  }
  const window = BrowserWindow.getFocusedWindow()
  const { response } = await (window
    ? dialog.showMessageBox(window, options)
    : dialog.showMessageBox(options))
  if (response !== 1) return false
  // Apply on the next launch, after this instance has finished its writes and cleanup.
  stageBackupRestore(dataDir(), buffer)
  setNotQuitDialog()
  app.relaunch()
  app.quit()
  return true
}

export async function localBackup(): Promise<boolean> {
  const window = BrowserWindow.getFocusedWindow()
  const options: Electron.SaveDialogOptions = {
    title: tr('Export backup'),
    defaultPath: `KokoroBox_${backupFilename()}`,
    filters: [{ name: 'ZIP', extensions: ['zip'] }]
  }
  const { canceled, filePath } = await (window
    ? dialog.showSaveDialog(window, options)
    : dialog.showSaveDialog(options))
  if (canceled || !filePath) return false
  const buffer = createBackupArchive(dataDir())
  const temporary = `${filePath}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, buffer, { mode: 0o600, flag: 'wx' })
    await rename(temporary, filePath)
  } finally {
    await rm(temporary, { force: true })
  }
  return true
}

export async function localRestore(): Promise<boolean> {
  const window = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    title: tr('Restore from file'),
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
    properties: ['openFile']
  }
  const { canceled, filePaths } = await (window
    ? dialog.showOpenDialog(window, options)
    : dialog.showOpenDialog(options))
  if (canceled || !filePaths[0]) return false
  if ((await stat(filePaths[0])).size > 512 * 1024 * 1024) {
    throw new Error(tr('Unable to read backup: {0}', ['Backup exceeds the size limit']))
  }
  return confirmRestore(await readFile(filePaths[0]), path.basename(filePaths[0]))
}

export async function webdavBackup(): Promise<boolean> {
  const { createClient } = await import('webdav/dist/node/index.js')
  const {
    webdavUrl = '',
    webdavUsername = '',
    webdavDir = DEFAULT_WEBDAV_DIR
  } = await getAppConfig()
  const webdavPassword = await getWebdavPassword()
  const zipData = createBackupArchive(dataDir())
  const zipFileName = backupFilename()

  const client = createClient(webdavUrl, {
    username: webdavUsername,
    password: webdavPassword
  })
  if (!(await client.exists(webdavDir))) {
    await client.createDirectory(webdavDir)
  }

  const uploaded = await client.putFileContents(`${webdavDir}/${zipFileName}`, zipData)
  if (!uploaded) throw new Error(tr('Backup upload failed'))
  return true
}

export async function webdavRestore(filename: string): Promise<boolean> {
  checkRemoteFilename(filename)
  const { createClient } = await import('webdav/dist/node/index.js')
  const {
    webdavUrl = '',
    webdavUsername = '',
    webdavDir = DEFAULT_WEBDAV_DIR
  } = await getAppConfig()
  const webdavPassword = await getWebdavPassword()

  const client = createClient(webdavUrl, {
    username: webdavUsername,
    password: webdavPassword
  })
  const zipData = await client.getFileContents(`${webdavDir}/${filename}`)
  return confirmRestore(zipData as Buffer, filename)
}

export async function listWebdavBackups(): Promise<string[]> {
  const { createClient } = await import('webdav/dist/node/index.js')
  const {
    webdavUrl = '',
    webdavUsername = '',
    webdavDir = DEFAULT_WEBDAV_DIR
  } = await getAppConfig()
  const webdavPassword = await getWebdavPassword()

  const client = createClient(webdavUrl, {
    username: webdavUsername,
    password: webdavPassword
  })
  if (!(await client.exists(webdavDir))) return []
  const files = await client.getDirectoryContents(webdavDir, { glob: '*.zip' })
  return files
    .filter((file) => file.type === 'file')
    .map((file) => file.basename)
    .sort()
}

export async function webdavDelete(filename: string): Promise<void> {
  checkRemoteFilename(filename)
  const { createClient } = await import('webdav/dist/node/index.js')
  const {
    webdavUrl = '',
    webdavUsername = '',
    webdavDir = DEFAULT_WEBDAV_DIR
  } = await getAppConfig()
  const webdavPassword = await getWebdavPassword()

  const client = createClient(webdavUrl, {
    username: webdavUsername,
    password: webdavPassword
  })
  await client.deleteFile(`${webdavDir}/${filename}`)
}
