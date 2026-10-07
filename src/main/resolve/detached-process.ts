import { spawn } from 'node:child_process'

export async function launchDetachedProcess(
  file: string,
  args: string[],
  spawnProcess: typeof spawn = spawn
): Promise<void> {
  const child = spawnProcess(file, args, { detached: true, stdio: 'ignore', windowsHide: true })
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
  child.unref()
}
