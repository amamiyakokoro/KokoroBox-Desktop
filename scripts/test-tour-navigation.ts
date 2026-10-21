import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as pageTours from '../src/renderer/src/utils/page-tours'
import * as tourNavigation from '../src/renderer/src/utils/tour-navigation'
import type { Config, Driver } from 'driver.js'
import { createTourNavigation } from '../src/renderer/src/utils/tour-navigation.ts'

function fixture(waitForPage = async (): Promise<boolean> => true) {
  const calls: unknown[] = []
  const navigation = createTourNavigation({
    pages: [
      { route: '/', readySelector: '.home-overview' },
      { route: '/settings?section=network&panel=tun', readySelector: '.tun-settings' },
      { route: '/', readySelector: '.home-overview' }
    ],
    navigate: (route) => {
      calls.push(['navigate', route])
    },
    waitForPage,
    showStep: (index, starting) => {
      calls.push(['show', index, starting])
    },
    close: () => {
      calls.push('close')
    },
    setPending: (pending) => {
      calls.push(['pending', pending])
    }
  })
  return { navigation, calls }
}

test('forward and backward steps restore their destination before highlighting', async () => {
  const { navigation, calls } = fixture()
  assert.equal(await navigation.goTo(0, true), true)
  assert.equal(await navigation.goTo(1), true)
  assert.equal(await navigation.goTo(2), true)
  assert.equal(await navigation.goTo(1), true)
  assert.deepEqual(
    calls.filter((call) => Array.isArray(call) && call[0] !== 'pending'),
    [
      ['navigate', '/'],
      ['show', 0, true],
      ['navigate', '/settings?section=network&panel=tun'],
      ['show', 1, false],
      ['navigate', '/'],
      ['show', 2, false],
      ['navigate', '/settings?section=network&panel=tun'],
      ['show', 1, false]
    ]
  )
})

test('slow pages are awaited and repeated clicks do not skip steps', async () => {
  let ready!: (value: boolean) => void
  const { navigation, calls } = fixture(
    () =>
      new Promise((resolve) => {
        ready = resolve
      })
  )
  const moving = navigation.goTo(1)
  await Promise.resolve()
  assert.equal(await navigation.goTo(2), false)
  assert.deepEqual(calls, [
    ['pending', true],
    ['navigate', '/settings?section=network&panel=tun']
  ])
  ready(true)
  assert.equal(await moving, true)
  assert.deepEqual(calls.slice(-2), [
    ['show', 1, false],
    ['pending', false]
  ])
})

test('closing during navigation cancels the pending highlight', async () => {
  let ready!: (value: boolean) => void
  const { navigation, calls } = fixture(
    () =>
      new Promise((resolve) => {
        ready = resolve
      })
  )
  const moving = navigation.goTo(1)
  await Promise.resolve()
  navigation.cancel()
  ready(true)
  assert.equal(await moving, false)
  assert.equal(
    calls.some((call) => Array.isArray(call) && call[0] === 'show'),
    false
  )
})

test('a missing page ends the tour instead of highlighting the previous page', async () => {
  const { navigation, calls } = fixture(async () => false)
  assert.equal(await navigation.goTo(1), false)
  assert.deepEqual(calls.slice(-2), ['close', ['pending', false]])
  assert.equal(
    calls.some((call) => Array.isArray(call) && call[0] === 'show'),
    false
  )
})

test('finishing the last step closes without navigating outside the tour', async () => {
  const { navigation, calls } = fixture()
  assert.equal(await navigation.goTo(3), false)
  assert.deepEqual(calls, ['close'])
})

function driverFixture(cssReady: Promise<void> = Promise.resolve()) {
  const storage = new Map<string, string>()
  const navigated: string[] = []
  const instances: Array<{ config: Config; instance: Driver; shown: number[] }> = []
  const element = { getClientRects: () => [{}] }
  let missingTargets = false
  const source = ts.transpileModule(readFileSync('src/renderer/src/utils/driver.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const exports = {} as {
    startTour: (navigate: import('react-router-dom').NavigateFunction) => Promise<boolean>
    startPageTour: (
      id: pageTours.PageTourId,
      navigate: import('react-router-dom').NavigateFunction,
      options?: { signal?: AbortSignal; replay?: boolean }
    ) => Promise<boolean>
    cancelPageTour: (id: pageTours.PageTourId) => void
  }
  const dependencies: Record<string, unknown> = {
    '../../../shared/i18n': { tr: (message: string) => message },
    './tour-navigation': tourNavigation,
    './page-tours': pageTours,
    'driver.js/dist/driver.css': cssReady,
    'driver.js': {
      driver: (config: Config) => {
        let active = false
        const shown: number[] = []
        const instance = {
          isActive: () => active,
          isFirstStep: () => shown.at(-1) === 0,
          getState: () => ({}),
          drive: (index = 0) => {
            active = true
            shown.push(index)
          },
          moveTo: (index: number) => shown.push(index),
          destroy: () => {
            active = false
            config.onDestroyed?.(undefined, config.steps?.[0] ?? {}, {
              driver: instance,
              config,
              state: {},
              index: shown.at(-1)
            })
          }
        } as unknown as Driver
        instances.push({ config, instance, shown })
        return instance
      }
    }
  }
  new Function(
    'require',
    'exports',
    'document',
    'window',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    source
  )(
    (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), name)
      return dependencies[name]
    },
    exports,
    {
      documentElement: { dataset: {} },
      body: element,
      querySelectorAll: (selector: string) =>
        missingTargets && !/^\[data-tour-page="[^"]+"\]$/.test(selector) ? [] : [element]
    },
    {
      matchMedia: () => ({ matches: false }),
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value)
      }
    },
    (callback: () => void) => setTimeout(callback, 0),
    clearTimeout
  )
  return {
    api: exports,
    storage,
    instances,
    element,
    navigate: ((route: string) => {
      navigated.push(route)
    }) as import('react-router-dom').NavigateFunction,
    navigated,
    hideTargets: () => {
      missingTargets = true
    }
  }
}

test('each sidebar page has a scoped three-step guide and a separate first-visit record', () => {
  assert.deepEqual(pageTours.pageTourIds, [
    'profiles',
    'app-routing',
    'proxies',
    'connections',
    'rules',
    'override',
    'logs'
  ])
  assert.equal(new Set(pageTours.pageTourIds.map(pageTours.pageTourStorageKey)).size, 7)
  for (const id of pageTours.pageTourIds) {
    const steps = pageTours.pageTourSteps(id)
    assert.equal(steps.length, 3)
    for (const step of steps) {
      assert.ok((step.element as string).startsWith(pageTours.pageTourSelector(id) + ' '))
      assert.ok(step.popover?.title)
      assert.ok(step.popover?.description)
    }
  }
})

test('page guides run once per page, allow replay, and keep other pages unseen', async () => {
  const f = driverFixture()
  assert.equal(await f.api.startPageTour('app-routing', f.navigate), true)
  assert.deepEqual(f.navigated, ['/app-routing'])
  assert.equal(f.storage.get(pageTours.pageTourStorageKey('app-routing')), 'true')
  assert.equal(f.storage.has(pageTours.pageTourStorageKey('logs')), false)
  f.api.cancelPageTour('app-routing')
  assert.equal(await f.api.startPageTour('app-routing', f.navigate), false)
  assert.equal(await f.api.startPageTour('app-routing', f.navigate, { replay: true }), true)
  f.api.cancelPageTour('app-routing')
  assert.equal(await f.api.startPageTour('logs', f.navigate), true)
  f.api.cancelPageTour('logs')
})

test('welcome and page guides cannot replace an active guide or race a pending start', async () => {
  const f = driverFixture()
  const first = f.api.startTour(f.navigate)
  assert.equal(await f.api.startPageTour('profiles', f.navigate), false)
  assert.equal(await first, true)
  assert.equal(await f.api.startPageTour('logs', f.navigate), false)
  assert.equal(f.instances.length, 1)
  assert.equal(f.storage.has(pageTours.pageTourStorageKey('logs')), false)
  f.instances[0].instance.destroy()
})

test('leaving during guide loading cancels the start without remembering an unseen guide', async () => {
  let ready!: () => void
  const f = driverFixture(
    new Promise<void>((resolve) => {
      ready = resolve
    })
  )
  const controller = new AbortController()
  const starting = f.api.startPageTour('connections', f.navigate, { signal: controller.signal })
  controller.abort()
  ready()
  assert.equal(await starting, false)
  assert.deepEqual(f.navigated, [])
  assert.equal(f.storage.has(pageTours.pageTourStorageKey('connections')), false)
  assert.equal(f.instances[0].instance.isActive(), false)
})

test('empty pages and direct proxy mode fall back to their own page instead of the sidebar', async () => {
  const f = driverFixture()
  f.hideTargets()
  assert.equal(await f.api.startPageTour('proxies', f.navigate), true)
  const step = f.instances[0].config.steps![1]
  assert.equal((step.element as () => Element)(), f.element)
  f.api.cancelPageTour('profiles')
  assert.equal(f.instances[0].instance.isActive(), true)
  f.api.cancelPageTour('proxies')
  assert.equal(f.instances[0].instance.isActive(), false)
})
