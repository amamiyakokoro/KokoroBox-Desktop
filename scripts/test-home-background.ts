import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultBuiltInBackgroundAppearance,
  homeNetworkCardBackgroundChoice,
  nextHomeDefaultBackgroundId,
  normalizeHomeDefaultBackgroundId,
  resolveHomeBackground,
  type HomeDefaultBackgroundId
} from '../src/shared/home.ts'
import { createHomeBackgroundSwitch } from '../src/shared/home-background-switch.ts'

const images = {
  ammy1: '/assets/ammy1.png',
  ammy2: '/assets/ammy2.png',
  ammy3: '/assets/ammy3.png'
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('one built-in background is selected deterministically and independently of theme', () => {
  assert.equal(normalizeHomeDefaultBackgroundId(undefined), 'ammy1')
  assert.equal(normalizeHomeDefaultBackgroundId('../../bad.png'), 'ammy1')
  assert.equal(nextHomeDefaultBackgroundId('ammy1'), 'ammy2')
  assert.equal(nextHomeDefaultBackgroundId('ammy2'), 'ammy3')
  assert.equal(nextHomeDefaultBackgroundId('ammy3'), 'ammy1')
  assert.equal(normalizeHomeDefaultBackgroundId('ammy3'), 'ammy3')

  const fresh = resolveHomeBackground(undefined, undefined, images)
  assert.equal(fresh.source, 'none')
  assert.equal(fresh.imageUrl, undefined)
  assert.equal(fresh.opacity, defaultBuiltInBackgroundAppearance.opacity)
  assert.equal(fresh.cardOpacity, 68)

  const selected = { homeDefaultBackgroundId: 'ammy2' as const, homeBackgroundDisabled: false }
  assert.equal(resolveHomeBackground(selected, undefined, images).imageUrl, images.ammy2)
  assert.equal(resolveHomeBackground(selected, undefined, images).position, 'right bottom')
  assert.equal(resolveHomeBackground(selected, undefined, images).scale, true)
  assert.equal(
    resolveHomeBackground(
      { homeDefaultBackgroundId: 'ammy3', homeBackgroundDisabled: false },
      undefined,
      images
    ).imageUrl,
    images.ammy3
  )
  assert.equal(
    resolveHomeBackground(
      { ...selected, homeDefaultBackgroundId: 'invalid' as 'ammy2' },
      undefined,
      images
    ).imageUrl,
    images.ammy1
  )
  // The resolver has no theme input: a theme change cannot select another image.
  assert.equal(resolveHomeBackground(selected, undefined, images).imageUrl, images.ammy2)
})

test('Network card custom background is opt-in and the former built-in choice falls back to none', () => {
  assert.equal(homeNetworkCardBackgroundChoice(undefined), 'none')
  assert.equal(homeNetworkCardBackgroundChoice('unknown'), 'none')
  assert.equal(homeNetworkCardBackgroundChoice('amamiya'), 'none')
  assert.equal(homeNetworkCardBackgroundChoice('custom'), 'custom')
})

test('built-in backgrounds apply horizontal alignment and optional original size', () => {
  const centered = resolveHomeBackground(
    {
      homeBackgroundDisabled: false,
      homeDefaultBackgroundAppearance: { alignment: 'center', scale: false }
    },
    undefined,
    images
  )
  assert.equal(centered.position, 'center bottom')
  assert.equal(centered.scale, false)
  assert.equal(
    resolveHomeBackground(
      {
        homeBackgroundDisabled: false,
        homeDefaultBackgroundAppearance: { alignment: 'left', scale: true }
      },
      undefined,
      images
    ).position,
    'left bottom'
  )
})

test('custom and none retain the selected built-in ID without showing a fallback image', () => {
  const custom = {
    file: 'home-background-0123456789abcdef0123456789abcdef.png',
    fit: 'cover' as const,
    position: 'top' as const,
    opacity: 37,
    blur: 4,
    overlay: 54
  }
  const config = {
    homeDefaultBackgroundId: 'ammy2' as const,
    homeBackground: custom,
    homeCardBackgroundOpacity: 61,
    homeDefaultBackgroundAppearance: { opacity: 91, blur: 0, overlay: 12 }
  }
  const loaded = resolveHomeBackground(config, 'data:image/png;base64,AA==', images)
  assert.equal(loaded.source, 'custom')
  assert.equal(loaded.imageUrl, 'data:image/png;base64,AA==')
  assert.equal(loaded.opacity, 37)
  assert.equal(loaded.position, 'center top')
  assert.equal(loaded.scale, true)
  assert.equal(loaded.blur, 4)
  assert.equal(loaded.overlay, 54)
  assert.equal(loaded.cardOpacity, 61)
  assert.equal(resolveHomeBackground(config, undefined, images).imageUrl, undefined)

  const aligned = resolveHomeBackground(
    { ...config, homeBackground: { ...custom, alignment: 'right' as const, scale: false } },
    undefined,
    images
  )
  assert.equal(aligned.position, 'right top')
  assert.equal(aligned.scale, false)
  assert.equal(
    resolveHomeBackground(
      { ...config, homeBackground: { ...custom, position: 'left' } },
      undefined,
      images
    ).position,
    'left center'
  )

  const none = resolveHomeBackground({ ...config, homeBackgroundDisabled: true }, undefined, images)
  assert.equal(none.source, 'none')
  assert.equal(none.imageUrl, undefined)

  const backToDefault = resolveHomeBackground(
    { ...config, homeBackground: undefined, homeBackgroundDisabled: false },
    undefined,
    images
  )
  assert.equal(backToDefault.imageUrl, images.ammy2)
  assert.equal(backToDefault.opacity, 91)
  assert.equal(backToDefault.overlay, 12)
})

test('manual switching preloads before persisting and serializes rapid clicks', async () => {
  let selectedId: HomeDefaultBackgroundId = 'ammy1'
  const loaded = deferred<void>()
  const saved: HomeDefaultBackgroundId[] = []
  let preloadCalls = 0
  const switchBackground = createHomeBackgroundSwitch(
    () => ({ mode: 'default', selectedId }),
    async (id) => {
      assert.equal(id, 'ammy2')
      preloadCalls++
      await loaded.promise
    },
    async (id) => {
      saved.push(id)
      selectedId = id
    }
  )
  const first = switchBackground()
  assert.equal(await switchBackground(), false)
  assert.equal(preloadCalls, 1)
  assert.equal(saved.length, 0)
  loaded.resolve()
  assert.equal(await first, true)
  assert.equal(saved.join(','), 'ammy2')
  assert.equal(selectedId, 'ammy2')

  // A new Home/settings instance reads the persisted ID and cycles onward.
  const afterRemount = createHomeBackgroundSwitch(
    () => ({ mode: 'default', selectedId }),
    async (id) => assert.equal(id, 'ammy3'),
    async (id) => {
      saved.push(id)
      selectedId = id
    }
  )
  assert.equal(await afterRemount(), true)
  assert.equal(saved.join(','), 'ammy2,ammy3')

  const wrapAround = createHomeBackgroundSwitch(
    () => ({ mode: 'default', selectedId }),
    async (id) => assert.equal(id, 'ammy1'),
    async (id) => {
      saved.push(id)
      selectedId = id
    }
  )
  assert.equal(await wrapAround(), true)
  assert.equal(saved.join(','), 'ammy2,ammy3,ammy1')
})

test('failed preload, failed persistence, and mode changes keep the current image', async () => {
  const selectedId: HomeDefaultBackgroundId = 'ammy1'
  let mode: 'default' | 'custom' | 'none' = 'default'
  let saveCalls = 0
  const failingLoad = createHomeBackgroundSwitch(
    () => ({ mode, selectedId }),
    async () => {
      throw new Error('decode failed')
    },
    async () => {
      saveCalls++
    }
  )
  await assert.rejects(failingLoad(), /decode failed/)
  assert.equal(selectedId, 'ammy1')
  assert.equal(saveCalls, 0)

  const failingSave = createHomeBackgroundSwitch(
    () => ({ mode, selectedId }),
    async () => {},
    async () => {
      throw new Error('write failed')
    }
  )
  await assert.rejects(failingSave(), /write failed/)
  assert.equal(selectedId, 'ammy1')

  const loading = deferred<void>()
  const switchBackground = createHomeBackgroundSwitch(
    () => ({ mode, selectedId }),
    () => loading.promise,
    async () => {
      saveCalls++
    }
  )
  const pending = switchBackground()
  mode = 'custom'
  loading.resolve()
  assert.equal(await pending, false)
  assert.equal(await switchBackground(), false)
  mode = 'none'
  assert.equal(await switchBackground(), false)
  assert.equal(saveCalls, 0)
  assert.equal(selectedId, 'ammy1')
})

test('a stale preload result cannot replace a newer selected image', async () => {
  let selectedId: HomeDefaultBackgroundId = 'ammy1'
  let saveCalls = 0
  const loading = deferred<void>()
  const switchBackground = createHomeBackgroundSwitch(
    () => ({ mode: 'default', selectedId }),
    () => loading.promise,
    async () => {
      saveCalls++
    }
  )
  const pending = switchBackground()
  selectedId = 'ammy2'
  loading.resolve()
  assert.equal(await pending, false)
  assert.equal(saveCalls, 0)
  assert.equal(selectedId, 'ammy2')
})
