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
const mac = process.platform === 'darwin'
if (!mac)
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run only on disposable GitHub-hosted runners')
const dir = fs.mkdtempSync(path.join(mac ? '/private/tmp' : process.env.RUNNER_TEMP, 'reload-'))
const work = path.join(dir, 'work'),
  ipc = win ? String.raw`\\.\pipe\kokorobox\service` : path.join(dir, 'service.sock'),
  canonical = path.join(work, 'config.yaml')
const suffix = win ? '.exe' : ''
const resources = '/Applications/KokoroBox.app/Contents/Resources'
const daemonBinary = mac
  ? path.join(resources, 'files/kokorobox-service')
  : path.resolve('test-bin', 'kokorobox-service' + suffix)
const binary = mac ? path.join(dir, 'mihomo') : path.resolve('test-bin', 'mihomo' + suffix)
let daemon
let diffWorkDir = false
let hotReloadSubscriptions = true
let failNextProfileCommit = false
const methods = []
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
  mihomoCorePath: () => binary,
  mihomoIpcPath: () =>
    win ? String.raw`\\.\pipe\kokorobox-reload-core` : path.join(dir, 'core.sock'),
  profileConfigPath: () => path.join(dir, 'profile.yaml'),
  profilePath: (id) => path.join(dir, 'profiles', id + '.yaml'),
  mihomoWorkDir: () => work,
  mihomoProfileWorkDir: (id) => path.join(work, id || 'default'),
  mihomoWorkConfigPath: (id, perProfile) =>
    path.join(perProfile ? dirs.mihomoProfileWorkDir(id) : work, 'config.yaml'),
  controledMihomoConfigPath: () => path.join(dir, 'mihomo.yaml')
}
const app = {
    getAppConfig: async () => ({
      hotReloadSubscriptions,
      diffWorkDir,
      corePermissionMode: 'service',
      serviceRunMode: win || mac ? 'auto' : 'sandbox',
      saveLogs: false,
      controlDns: false,
      controlSniff: false
    })
  },
  ctrl = {}
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
const transactions = fromRepo('config/profile-key-transaction')
const profile = load('config/profile', {
  './profile-key-transaction': {
    ...transactions,
    writeProfileKeyTransaction: (...args) => {
      if (failNextProfileCommit) {
        failNextProfileCommit = false
        throw new Error('injected commit failure')
      }
      return transactions.writeProfileKeyTransaction(...args)
    }
  },
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
Object.assign(
  ctrl,
  load('config/controledMihomo', {
    '../utils/dirs': dirs,
    './app': app,
    '../core/manager': manager,
    '../core/factory': factory,
    '../utils/template': { defaultControledMihomoConfig: { 'log-level': 'warning' } }
  })
)
Object.assign(data, ctrl)
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
  ['runtimeController', 'mihomoConfig', 'reloadMihomoConfig', 'patchMihomoConfig']
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
      mihomoConfig: api.mihomoConfig,
      reloadMihomoConfig: (...args) => {
        methods.push('PUT')
        return api.reloadMihomoConfig(...args)
      },
      patchMihomoConfig: (...args) => {
        methods.push('PATCH')
        return api.patchMihomoConfig(...args)
      },
      writeDurableText: fromRepo('config/profile-key-transaction').writeDurableText,
      ServiceAPIError: service.ServiceAPIError,
      getCoreStatus: service.getCoreStatus,
      getServiceCoreProfile: service.getServiceCoreProfile,
      path,
      directCoreState: {},
      mihomoCorePath: () => binary,
      tr,
      ipcMain: { emit: noop },
      mainWindow: { webContents: { send: (event) => events.push(event) } },
      uploadRuntimeConfig: noop
    },
    ['tryApplyRuntimeConfig']
  )
)
// Use Desktop's stop/start chain and launch arguments. Only host integration
// (menus, DNS, event streams and service installation) is isolated from this test.
const lifecycle = load(
  'core/manager',
  {
    ...data,
    ...app,
    ...factory,
    getCoreStatus: service.getCoreStatus,
    getCoreDesiredStatus: service.getCoreDesiredStatus,
    isServiceUnavailableError: service.isServiceUnavailableError,
    ...load('core/startup-chain', { '../utils/dirs': dirs }),
    ...load('core/profile-check', {
      '../config': data,
      '../utils/dirs': dirs,
      './profile-validation': validators
    }),
    ...fromRepo('core/coreHookPath'),
    ctlParam: win ? '-ext-ctl-pipe' : '-ext-ctl-unix',
    mihomoCorePath: dirs.mihomoCorePath,
    coreLogPath: () => path.join(dir, 'core.log'),
    startServiceCore: service.startCore,
    stopServiceCore: service.stopCore,
    beginExpectedNetworkTransition: () => noop,
    clearTailscaleAuthNotifications: noop,
    ensureMacOSServiceReady: noop,
    repairUninitializedService: noop,
    recoverDNS: noop,
    stopLegacyDirectCore: async () => false,
    getAxios: noop,
    setMihomoLogSource: noop,
    appendAppLog: noop,
    showNotification: noop,
    tr,
    serviceCoreRuntime: {
      isManaged: () => true,
      pauseAutoResume: noop,
      clearStreams: noop,
      setManaged: noop,
      stopEventHandlers: noop,
      resumeAutoResume: noop,
      ensureEventHandler: noop,
      beginStartup: noop,
      startEventStream: noop,
      endStartup: noop,
      ensureStreamsStarted: noop
    },
    completeCoreInitialization: async (level) => api.patchMihomoConfig({ 'log-level': level }, true)
  },
  ['startCore', 'stopCore', 'restartCore']
)
manager.restartCore = async (options) => {
  methods.push('restart')
  await lifecycle.restartCore(options)
}
async function launch(directory) {
  await service.startCore({
    core_path: binary,
    args: ['-d', directory],
    mode: win || mac ? 'auto' : 'sandbox',
    save_logs: false,
    safe_paths: []
  })
}
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
  if (mac) {
    await fsp.copyFile(path.join(resources, 'sidecar/mihomo'), binary)
    await fsp.chmod(binary, 0o700)
    daemon = cp.spawn(daemonBinary, ['--listen', ipc, 'service', 'run'], {
      env: { ...process.env, KOKOROBOX_CONFIG_DIR: configRoot, TMPDIR: dir },
      stdio: 'ignore'
    })
  } else if (win) {
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
  await launch(work)
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
  report.validation_outcomes = [...validations]
  await verifyProfileSwitches()
}
async function verifyProfileSwitches() {
  await updater.delProfileUpdater(item.id)
  override = {}
  const other = { ...item, id: 'second', autoUpdate: false }
  const broken = { ...other, id: 'invalid' }
  const config = await profile.getProfileConfig()
  await profile.setProfileConfig({ ...config, items: [...config.items, other, broken] })
  await fsp.writeFile(dirs.profilePath(other.id), inputRule('REJECT'))
  await fsp.writeFile(dirs.profilePath(broken.id), inputRule(invalidRule))

  async function inspect(name, action, expectedMethod, expectedId, rule, directory) {
    const before = await service.getCoreStatus()
    methods.length = 0
    await action()
    assert.deepEqual(methods, [expectedMethod ?? []].flat())
    const after = await service.getCoreStatus()
    if (expectedMethod === 'restart') assert.notEqual(before.pid, after.pid)
    else assert.deepEqual([before.pid, before.start_time], [after.pid, after.start_time])
    const { args } = await service.getServiceCoreProfile()
    assert.equal(args[args.indexOf('-d') + 1], directory)
    assert.equal((await profile.getProfileConfig(true)).current, expectedId)
    assert.equal((await client.get('/rules')).rules[0].proxy, rule)
    const disk = await fsp.readFile(path.join(directory, 'config.yaml'), 'utf8')
    assert.deepEqual(yaml.parseYaml(disk).rules, ['MATCH,' + rule])
    assert.equal(await factory.getRuntimeConfigStr(), disk)
    report.stages.push({ name, method: expectedMethod, pid: after.pid, directory, rule })
    console.log(name, expectedMethod || 'retained', before.pid, '->', after.pid, directory, rule)
  }

  await inspect(
    'shared switch',
    () => profile.changeCurrentProfile(other.id),
    'PUT',
    other.id,
    'REJECT',
    work
  )
  await inspect(
    'invalid shared switch',
    () => assert.rejects(profile.changeCurrentProfile(broken.id), /GROUP-DOES-NOT-EXIST/i),
    undefined,
    other.id,
    'REJECT',
    work
  )
  await inspect(
    'log level only',
    () => ctrl.patchControledMihomoConfig({ 'log-level': 'debug' }, true),
    'PATCH',
    other.id,
    'REJECT',
    work
  )
  assert.equal((await client.get('/configs'))['log-level'], 'debug')

  incoming = 'mode: direct\n' + inputRule('REJECT')
  await inspect(
    'subscription mode only',
    async () => profile.addProfileItem(await profile.getProfileItem(other.id)),
    'PATCH',
    other.id,
    'REJECT',
    work
  )
  assert.equal((await client.get('/configs')).mode, 'direct')
  failNextProfileCommit = true
  incoming = inputRule('REJECT')
  await inspect(
    'failed PATCH commit restores live mode',
    async () =>
      assert.rejects(
        profile.addProfileItem(await profile.getProfileItem(other.id)),
        /injected commit failure/
      ),
    ['PATCH', 'PATCH'],
    other.id,
    'REJECT',
    work
  )
  assert.equal((await client.get('/configs')).mode, 'direct')
  assert.match(await profile.getProfileStr(other.id), /mode: direct/)
  incoming = inputRule('REJECT')
  await inspect(
    'subscription restores default mode',
    async () => profile.addProfileItem(await profile.getProfileItem(other.id)),
    'PATCH',
    other.id,
    'REJECT',
    work
  )
  assert.equal((await client.get('/configs')).mode, 'rule')
  override = { rules: ['MATCH,DIRECT'] }
  await inspect(
    'active override',
    () => profile.applyCurrentProfile(),
    'PUT',
    other.id,
    'DIRECT',
    work
  )
  override = {}
  await inspect(
    'remove override',
    () => profile.applyCurrentProfile(),
    'PUT',
    other.id,
    'REJECT',
    work
  )

  diffWorkDir = true
  const firstDir = dirs.mihomoProfileWorkDir(item.id),
    secondDir = dirs.mihomoProfileWorkDir(other.id)
  await inspect(
    'enter independent directory',
    () => profile.changeCurrentProfile(item.id),
    'restart',
    item.id,
    'DIRECT',
    firstDir
  )
  await inspect(
    'independent switch',
    () => profile.changeCurrentProfile(other.id),
    'restart',
    other.id,
    'REJECT',
    secondDir
  )
  assert.deepEqual(
    yaml.parseYaml(await fsp.readFile(path.join(firstDir, 'config.yaml'), 'utf8')).rules,
    ['MATCH,DIRECT']
  )
  await inspect(
    'invalid independent switch',
    () => assert.rejects(profile.changeCurrentProfile(broken.id), /GROUP-DOES-NOT-EXIST/i),
    undefined,
    other.id,
    'REJECT',
    secondDir
  )
  await inspect(
    'same independent directory',
    () => profile.changeCurrentProfile(other.id),
    'PUT',
    other.id,
    'REJECT',
    secondDir
  )
  diffWorkDir = false
  await inspect(
    'return to shared directory',
    () => profile.changeCurrentProfile(item.id),
    'restart',
    item.id,
    'DIRECT',
    work
  )
  hotReloadSubscriptions = false
  await inspect(
    'disabled shared switch',
    () => profile.changeCurrentProfile(other.id),
    'restart',
    other.id,
    'REJECT',
    work
  )
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
      if (mac) {
        if (daemon.exitCode === null && daemon.signalCode === null) {
          const exited = once(daemon, 'exit')
          daemon.kill('SIGTERM')
          await exited
        }
      } else if (win) cp.execFileSync(daemonBinary, ['service', 'uninstall'], { stdio: 'inherit' })
      else
        cp.execFileSync('sudo', ['systemctl', 'stop', 'kokorobox-hot-reload'], { stdio: 'inherit' })
    }
  }
  if (report.stages) {
    report.cleaned_up = true
    await fsp.writeFile(
      path.join(mac ? dir : process.cwd(), 'service-reload-results.json'),
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
