import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

// Container-only flags: this checks X11 startup, not desktop sandbox/Wayland policy.
const child = spawn(
  '/usr/bin/sparkle',
  ['--no-sandbox', '--disable-gpu', '--ozone-platform=x11', '--remote-debugging-port=9222'],
  { stdio: 'inherit' }
)
let startupError
child.on('error', (error) => {
  startupError = error
})
let socket
const deadline = Date.now() + 60_000
const watchdog = setTimeout(() => {
  console.error('Timed out waiting for the packaged renderer and IPC')
  child.kill('SIGKILL')
  process.exit(1)
}, 65_000)

try {
  let page
  while (Date.now() < deadline) {
    if (startupError) throw startupError
    assert.equal(child.exitCode, null, 'Application exited before renderer startup')
    assert.equal(child.signalCode, null, 'Application crashed before renderer startup')
    try {
      const response = await fetch('http://127.0.0.1:9222/json/list', {
        signal: AbortSignal.timeout(1000)
      })
      const pages = await response.json()
      page = pages.find(
        (entry) => entry.type === 'page' && /\/renderer\/index\.html/.test(entry.url)
      )
      if (page) break
    } catch {
      /* DevTools is not listening yet. */
    }
    await delay(250)
  }
  assert.ok(page, 'Packaged main window did not open')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const evaluate = (expression) =>
    new Promise((resolve, reject) => {
      const requestId = ++id
      const onMessage = ({ data }) => {
        const message = JSON.parse(data)
        if (message.id !== requestId) return
        socket.removeEventListener('message', onMessage)
        if (message.error || message.result?.exceptionDetails) {
          reject(new Error(JSON.stringify(message)))
        } else {
          resolve(message.result.result.value)
        }
      }
      socket.addEventListener('message', onMessage)
      socket.send(
        JSON.stringify({
          id: requestId,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true }
        })
      )
    })
  let ready = false
  while (Date.now() < deadline) {
    ready = await evaluate(`Boolean(
      document.querySelector('#root')?.innerText.trim().length > 50 &&
      !document.querySelector('details[title="Error Stack"]') &&
      window.api?.platform === 'linux' && window.electron?.ipcRenderer
    )`)
    if (ready) break
    await delay(250)
  }
  assert.ok(ready, 'Renderer did not mount successfully with its preload bridge')
  const config = await evaluate("window.electron.ipcRenderer.invoke('getAppConfig')")
  assert.ok(
    config && typeof config === 'object' && config.sysProxy,
    'Main-process configuration IPC did not return an application config'
  )
  await delay(3000)
  assert.equal(child.exitCode, null, 'Application exited after rendering')
  assert.equal(child.signalCode, null, 'Application crashed after rendering')
  console.log('Packaged renderer mounted and main-process IPC succeeded')
} finally {
  clearTimeout(watchdog)
  socket?.close()
  child.kill('SIGKILL')
}
