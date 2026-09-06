import crypto from 'crypto'
import { readFile } from 'fs/promises'
import path from 'path'
import { processRouterDir } from '../utils/dirs'
import {
  processRouterBinaryNames,
  type ProcessRouterManifest,
  validateProcessRouterManifest
} from './integrity-manifest'

export async function verifyProcessRouterIntegrity(): Promise<void> {
  const root = processRouterDir()
  const manifest = JSON.parse(
    await readFile(path.join(root, 'manifest.json'), 'utf8')
  ) as ProcessRouterManifest
  const hashes: Record<string, string> = {}
  await Promise.all(
    processRouterBinaryNames.map(async (name) => {
      hashes[name] = crypto
        .createHash('sha256')
        .update(await readFile(path.join(root, name)))
        .digest('hex')
    })
  )
  validateProcessRouterManifest(manifest, hashes)
}
