const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  fsp = require('node:fs/promises')
const path = require('node:path'),
  cp = require('node:child_process'),
  { once } = require('node:events')
const { setTimeout: sleep } = require('node:timers/promises'),
  { createRequire } = require('node:module')
const req = createRequire(path.join(process.cwd(), 'package.json'))
req('tsx/cjs')
const ts = req('typescript'),
  axios = req('axios'),
  os = require('node:os')
const win = process.platform === 'win32'
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run only on disposable GitHub-hosted runners')
const dir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, 'reload-'))
const work = path.join(dir, 'work'),
  ipc = win ? String.raw`\\.\pipe\kokorobox\service` : path.join(dir, 'service.sock'),
  canonical = path.join(work, 'config.yaml')
const suffix = win ? '.exe' : ''
const daemonBinary = path.resolve('test-bin', 'kokorobox-service' + suffix)
const binary = path.resolve('test-bin', 'mihomo' + suffix)
const crypto = require('node:crypto'),
  http = require('node:http')
let feed,
  latestError,
  daemonStarted = false,
  coreStarted = false,
  goodIdentity,
  report = {}
const errors = [],
  validations = []
const pub = crypto.generateKeyPairSync('ed25519')
const spki = pub.publicKey.export({ type: 'spki', format: 'der' })
const keyID = crypto.createHash('sha256').update(spki).digest('hex')
const fromRepo = (file) => req('./src/main/' + file + '.ts')
function load(file, stubs, names) {
  const input = path.resolve('src/main/' + file + '.ts'),
    nativeReq = createRequire(input)
  let src = fs.readFileSync(input, 'utf8')
  if (names) {
    const ast = ts.createSourceFile(input, src, ts.ScriptTarget.ES2022, true)
    src = names
      .map((name) => ast.statements.find((n) => n.name?.text === name).getText(ast))
      .join('\n')
  }
  const js = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  const out = {}
  new Function('exports', 'require', ...(names ? Object.keys(stubs) : []), js)(
    out,
    (name) => (Object.hasOwn(stubs, name) ? stubs[name] : nativeReq(name)),
    ...(names ? Object.values(stubs) : [])
  )
  return out
}
const data = {},
  updater = {},
  manager = {},
  events = []
const dirs = {
  dataDir: () => dir,
  profileConfigPath: () => path.join(dir, 'profile.yaml'),
  profilePath: (id) => path.join(dir, 'profiles', id + '.yaml'),
  mihomoWorkDir: () => work,
  mihomoWorkConfigPath: () => canonical
}
const app = {
    getAppConfig: async () => ({ hotReloadSubscriptions: true, corePermissionMode: 'service' })
  },
  ctrl = { getControledMihomoConfig: async () => ({ 'log-level': 'warning' }) }
const item = {
  id: 'active',
  type: 'remote',
  name: 'test',
  url: 'http://fixture.test/',
  ua: 'test',
  interval: 1,
  autoUpdate: true,
  updated: Date.now()
}
const yaml = fromRepo('utils/yaml'),
  tr = (x) => x
let incoming = 'rules: [MATCH,DIRECT]',
  requests = 0,
  override = {}
const noop = async () => {}
const profile = load('config/profile', {
  '../core/manager': manager,
  '../core/profileUpdater': updater,
  '../utils/dirs': dirs,
  './app': app,
  './controledMihomo': ctrl,
  '../utils/log': { appendAppLog: noop },
  '../utils/userAgent': {},
  '../utils/age': { isAgeEncryptedText: () => false },
  '../utils/template': {},
  '../kokoro/client': {},
  '../kokoro/profile-check': {},
  'kokorobox-native': {}
})
Object.assign(data, profile, app, ctrl, {
  getOverrideConfig: async () => ({ items: [{ id: 'rule', global: true }] }),
  getOverrideItem: async () => ({ id: 'rule', ext: 'yaml' }),
  getOverride: async () => yaml.stringifyYaml(override)
})
const factory = load('core/factory', {
  '../config': data,
  '../utils/dirs': dirs,
  './override-worker?nodeWorker': {},
  '../app-routing/config': { getAppRoutingConfig: async () => ({ enabled: false }) }
})
const service = load('service/api', {
  '../utils/dirs': { serviceIpcPath: () => ipc },
  '../utils/log': { appendAppLog: noop },
  './fallback': { shouldSkipServiceUnavailableFallback: () => false }
})
service.initServiceAPI({
  isInitialized: () => true,
  getKeyID: () => keyID,
  signData: (msg) => crypto.sign(null, Buffer.from(msg), pub.privateKey).toString('base64')
})
const reload = fromRepo('core/subscription-reload')
const api = load(
  'core/mihomoApi',
  {
    axios,
    ReloadRejected: reload.ReloadRejected,
    ServiceAPIError: service.ServiceAPIError,
    createSignedServiceAxios: service.createSignedServiceAxios
  },
  ['reloadMihomoConfig']
)
const validators = load('core/profile-validation', {
  '../service/api': {
    ...service,
    validateServiceCoreProfile: async (opts) => {
      const out = await service.validateServiceCoreProfile(opts)
      validations.push(out.outcome)
      return out
    }
  },
  'kokorobox-native': { validateCoreProfile: () => assert.fail('unexpected native fallback') }
})
Object.assign(
  manager,
  load(
    'core/manager',
    {
      ...factory,
      ...reload,
      ...validators,
      ...app,
      ...api,
      getServiceCoreProfile: service.getServiceCoreProfile,
      path,
      directCoreState: {},
      mihomoCorePath: () => binary,
      tr,
      ipcMain: { emit: noop },
      mainWindow: { webContents: { send: (event) => events.push(event) } },
      uploadRuntimeConfig: noop
    },
    ['hotReloadSubscription']
  )
)
manager.restartCore = async () => assert.fail('unexpected restart')
Object.assign(
  updater,
  load('core/profileUpdater', {
    '../config': data,
    '../utils/log': {
      appendAppLog: async (msg) => {
        errors.push(msg)
        console.log(msg.trim())
      }
    }
  })
)
const client = service.createSignedServiceAxios('http://localhost/core/controller', false)
const inputRule = (target) => 'rules:\n  - MATCH,' + target + '\n'
const invalidRule = 'GROUP-DOES-NOT-EXIST'
async function setup() {
  const principal = win
    ? {
        type: 'sid',
        value: cp
          .execFileSync(
            'powershell.exe',
            [
              '-NoProfile',
              '-Command',
              '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'
            ],
            { encoding: 'utf8' }
          )
          .trim()
      }
    : { type: 'uid', value: String(process.getuid()) }
  const configRoot = win ? process.env.ProgramData : path.join(dir, 'service-data')
  const keys = path.join(configRoot, 'KokoroBox', 'keys')
  assert.equal(fs.existsSync(keys), false, 'Service data must be fresh')
  await fsp.mkdir(keys, { recursive: true, mode: 0o700 })
  await fsp.writeFile(
    path.join(keys, 'public_keys.json'),
    JSON.stringify({ current: { key_id: keyID, public_key: spki.toString('base64') } }),
    { mode: 0o600 }
  )
  await fsp.writeFile(path.join(keys, 'authorized_principal.json'), JSON.stringify(principal), {
    mode: 0o600
  })
  if (win) {
    cp.execFileSync(daemonBinary, ['service', 'install'], { stdio: 'inherit' })
  } else {
    cp.execFileSync(
      'sudo',
      [
        'systemd-run',
        '--unit=kokorobox-hot-reload',
        '--setenv=KOKOROBOX_CONFIG_DIR=' + configRoot,
        daemonBinary,
        '--listen',
        ipc,
        'service',
        'run'
      ],
      { stdio: 'inherit' }
    )
  }
  daemonStarted = true
  await until(
    async () => {
      try {
        await service.ping()
        return true
      } catch {
        return false
      }
    },
    'Service did not accept IPC requests',
    30000
  )
  const meta = await service.getServiceMeta()
  assert.equal(meta.capabilities.coreProfileValidation, true)
  report = {
    host: process.platform,
    release: os.release(),
    architecture: os.arch(),
    service: meta.serviceVersion,
    commit: process.env.GITHUB_SHA,
    stages: []
  }
  feed = http.createServer((r, res) => {
    requests++
    res.writeHead(200, { 'Content-Type': 'text/yaml' })
    res.end(incoming)
  })
  feed.listen(0, '127.0.0.1')
  await once(feed, 'listening')
  item.url = 'http://127.0.0.1:' + feed.address().port + '/subscription'
  await fsp.mkdir(work, { recursive: true })
  await fsp.mkdir(path.join(dir, 'profiles'), { recursive: true })
  await fsp.writeFile(
    dirs.profileConfigPath(),
    yaml.stringifyYaml({ current: item.id, items: [item] })
  )
  await fsp.writeFile(dirs.profilePath(item.id), inputRule('DIRECT'))
  await factory.generateProfile()
  await service.startCore({
    core_path: binary,
    args: ['-d', work],
    mode: win ? 'auto' : 'sandbox',
    save_logs: false,
    safe_paths: []
  })
  coreStarted = true
  const status = await service.getCoreStatus()
  assert.equal(status.launch_mode, 'managed')
  assert.equal(path.normalize(status.executable), path.normalize(binary))
  goodIdentity = { pid: status.pid, start_time: status.start_time }
  const version = await client.get('/version')
  report.mihomo = version.version
  console.log(
    'genuine managed Service',
    JSON.stringify({ meta: meta.serviceVersion, core: version.version, ...goodIdentity })
  )
}
async function until(f, why, ms = 8000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await f()) return
    await sleep(40)
  }
  throw Error(why)
}
async function snapshot() {
  const { pid, start_time, launch_mode } = await service.getCoreStatus(3000, true)
  const rule = (await client.get('/rules')).rules[0].proxy
  const digest = (value) => crypto.createHash('sha256').update(value).digest('hex')
  const [runtime, metadata, source] = await Promise.all(
    [canonical, dirs.profileConfigPath(), dirs.profilePath(item.id)].map((p) => fsp.readFile(p))
  )
  return {
    pid,
    start_time,
    launch_mode,
    rule,
    runtime: digest(runtime),
    metadata: digest(metadata),
    source: digest(source),
    cache: digest(await factory.getRuntimeConfigStr())
  }
}
async function check(name, rule, good) {
  const s = await snapshot()
  assert.equal(s.pid, goodIdentity.pid)
  assert.equal(s.start_time, goodIdentity.start_time)
  assert.equal(s.launch_mode, 'managed')
  assert.equal(s.rule, rule)
  assert.equal(s.cache, s.runtime)
  if (good) assert.deepEqual(s, good)
  report.stages.push({ name, ...s })
  console.log(name, 'PID', s.pid, 'rule', s.rule, good ? 'previous state retained' : '')
  return s
}
async function main() {
  await setup()
  await check('baseline', 'DIRECT')
  incoming = inputRule('REJECT')
  await profile.addProfileItem(await profile.getProfileItem(item.id))
  await check('manual valid', 'REJECT')
  incoming = inputRule('DIRECT')
  await profile.updateProfileItem({ ...(await profile.getProfileItem(item.id)), updated: 1 })
  await until(
    () => events.filter((e) => e === 'rulesUpdated').length === 2,
    'scheduled update failed: ' + errors
  )
  const good = await check('scheduled valid', 'DIRECT')
  assert.equal(requests, 2)
  incoming = inputRule('REJECT')
  override = { rules: ['MATCH,' + invalidRule] }
  await assert.rejects(
    profile.addProfileItem(await profile.getProfileItem(item.id)),
    new RegExp(invalidRule, 'i')
  )
  await check('manual invalid', 'DIRECT', good)
  // Force only the scheduler clock overdue, leaving the saved revision unchanged.
  const scheduler = fromRepo('core/profile-update-scheduler').createProfileUpdateScheduler({
    getItem: (id) => profile.getProfileItem(id),
    refresh: profile.addProfileItem,
    now: () => Date.now() + 61000,
    onError: (id, e) => {
      latestError = e
    }
  })
  try {
    scheduler.upsert(await profile.getProfileItem(item.id))
    await until(() => latestError, 'invalid scheduled update did not report failure')
    assert.match(String(latestError), new RegExp(invalidRule, 'i'))
    await check('scheduled invalid', 'DIRECT', good)
  } finally {
    scheduler.clear()
  }
  assert.deepEqual(validations, ['valid', 'valid', 'invalid', 'invalid'])
  assert.equal(requests, 4)
  assert.equal(events.filter((e) => e === 'rulesUpdated').length, 2)
  report.validation_outcomes = validations
}
async function cleanup() {
  await updater.delProfileUpdater(item.id)
  try {
    if (coreStarted) {
      await service.stopCore()
      assert.equal((await service.getCoreDesiredStatus()).desired_state, 'stopped')
    }
  } finally {
    if (feed) feed.close()
    if (daemonStarted) {
      if (win) cp.execFileSync(daemonBinary, ['service', 'uninstall'], { stdio: 'inherit' })
      else
        cp.execFileSync('sudo', ['systemctl', 'stop', 'kokorobox-hot-reload'], { stdio: 'inherit' })
    }
  }
  if (report.stages) {
    report.cleaned_up = true
    await fsp.writeFile(
      path.resolve('service-reload-results.json'),
      JSON.stringify(report, null, 2)
    )
  }
}
main()
  .catch((e) => {
    console.error(e.stack)
    process.exitCode = 1
  })
  .finally(cleanup)
  .catch((e) => {
    console.error('cleanup:', e.message)
    process.exitCode = 1
  })
