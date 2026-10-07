import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deepMerge } from '../src/main/utils/merge'
import { parseYaml } from '../src/main/utils/yaml'

test('merge rejects dangerous YAML keys before mutating the target, including modifiers and replacement payloads', () => {
  for (const key of [
    '__proto__',
    'constructor',
    'prototype',
    '<__proto__>',
    '__proto__!',
    '+<constructor>',
    'prototype+'
  ]) {
    const target = { safe: 1 }
    const patch = parseYaml<object>(`safe: 2\nnested!:\n  ${key}:\n    polluted: true\n`)
    assert.throws(() => deepMerge(target, patch, true), /Unsafe configuration key/)
    assert.deepEqual(target, { safe: 1 })
    assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false)
  }
})

test('merge ignores inherited keys and replaces incompatible target values', () => {
  const patch = Object.assign(Object.create({ inherited: true }), { dns: { enable: true } })
  const target = { dns: false } as Record<string, unknown>
  assert.deepEqual(deepMerge(target, patch), { dns: { enable: true } })
})

test('merge preserves array modifiers, replacement objects, and wrapped object keys', () => {
  const target = { rules: ['old'], dns: { enable: true, listen: 'old' }, policy: { old: true } }
  deepMerge(
    target,
    { '+rules': ['first'], '<dns>': { listen: 'new' }, 'policy!': { fresh: true } } as object,
    true
  )
  deepMerge(target, { 'rules+': ['last'] } as object, true)
  assert.deepEqual(target, {
    rules: ['first', 'old', 'last'],
    dns: { enable: true, listen: 'new' },
    policy: { fresh: true }
  })
})
