import assert from 'node:assert/strict'
import { test } from 'node:test'
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
