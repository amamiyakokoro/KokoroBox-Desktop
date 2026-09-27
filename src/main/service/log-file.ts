import { open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { posix, win32 } from 'node:path'
import type { ServiceLogSnapshot } from '../../shared/service-log'

const maxTailBytes = 512 * 1024

export function serviceLogPaths(
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  tempDirectory = tmpdir()
): string[] {
  const roots =
    platform === 'win32'
      ? [
          environment.SystemTemp,
          win32.join(environment.SystemRoot || 'C:\\Windows', 'SystemTemp'),
          win32.join(environment.SystemRoot || 'C:\\Windows', 'Temp'),
          tempDirectory
        ]
      : ['/tmp', tempDirectory]
  const path = platform === 'win32' ? win32 : posix
  return [...new Set(roots.filter((root): root is string => Boolean(root)))].map((root) =>
    path.join(root, 'kokorobox-service.log')
  )
}

export async function readServiceLogFile(paths = serviceLogPaths()): Promise<ServiceLogSnapshot> {
  let failure: unknown
  for (const path of paths) {
    let file: Awaited<ReturnType<typeof open>> | undefined
    try {
      file = await open(path, 'r')
      const stat = await file.stat()
      if (!stat.isFile()) continue
      const offset = Math.max(0, stat.size - maxTailBytes)
      const buffer = Buffer.alloc(stat.size - offset)
      const { bytesRead } = await file.read(buffer, 0, buffer.length, offset)
      let start = 0
      while (start < bytesRead && (buffer[start] & 0xc0) === 0x80) start++
      return {
        session: `${path}:${stat.dev}:${stat.ino}:${stat.birthtimeMs}`,
        offset: offset + start,
        end: offset + bytesRead,
        content: buffer.subarray(start, bytesRead).toString('utf8')
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failure ??= error
    } finally {
      await file?.close()
    }
  }
  if (failure) throw failure
  return { session: 'missing', offset: 0, end: 0, content: '' }
}
