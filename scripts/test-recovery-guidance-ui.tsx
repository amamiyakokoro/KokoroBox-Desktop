import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RecoveryGuidance } from '../src/renderer/src/components/runtime/recovery-guidance'
import {
  buildRuntimeRecoveryGuidance,
  type RuntimeRecoverySnapshot
} from '../src/shared/runtime-recovery'
import { messages as zhTW } from '../src/shared/locales/zh-TW'
import { messages as zhCN } from '../src/shared/locales/zh-CN'
import { recoveryActionLabel } from '../src/shared/runtime-recovery'

function fixture(
  state: AppRoutingStatus['state'],
  needsUserApproval: boolean
): RuntimeRecoverySnapshot {
  return {
    checkedAt: '2026-10-14T00:00:00Z',
    platform: 'darwin',
    service: 'not-installed',
    serviceRequired: false,
    coreMode: 'direct',
    core: 'running',
    proxy: { required: false, port: 7890, available: true },
    routing: {
      enabled: true,
      hasRules: true,
      requiresProxy: true,
      status: { state, supported: true, mihomoAvailable: state === 'running', needsUserApproval }
    }
  }
}

test('safely blocked routing renders distinct extension and endpoint states without approval buttons', () => {
  const html = renderToStaticMarkup(
    <RecoveryGuidance
      guidance={buildRuntimeRecoveryGuidance(fixture('degraded', false))}
      onAction={() => {}}
    />
  )
  assert.match(html, /data-recovery-layer="routing"/)
  assert.match(html, /data-recovery-layer="routing-endpoint"/)
  assert.match(html, /data-recovery-cause="routing-endpoint"/)
  assert.match(html, /Restart core/)
  assert.match(html, /Checked at/)
  assert.doesNotMatch(html, /Request Approval|Login Items/)
})

test('confirmed approval renders complete instructions and a pending check disables every action', () => {
  const html = renderToStaticMarkup(
    <RecoveryGuidance
      guidance={buildRuntimeRecoveryGuidance(fixture('starting', true))}
      busy
      onAction={() => {}}
    />
  )
  assert.match(html, /data-recovery-cause="extension-approval"/)
  assert.match(html, /Open System Settings and Request Approval/)
  assert.match(html, /Login Items &amp; Extensions/)
  assert.match(html, /Return to KokoroBox/)
  assert.match(html, /aria-busy="true"/)
  for (const button of html.matchAll(/<button\b[^>]*>/g)) assert.match(button[0], /disabled=""/)
})

test('recovery explanations and actions are available in both Chinese catalogs', () => {
  for (const state of ['degraded', 'starting', 'error'] as const) {
    const guidance = buildRuntimeRecoveryGuidance(fixture(state, state === 'starting'))
    assert.ok(guidance.issue)
    const messages = [
      guidance.issue.title,
      guidance.issue.description,
      ...guidance.issue.actions.map(recoveryActionLabel),
      ...guidance.layers.flatMap((layer) => [layer.title, layer.label])
    ]
    for (const message of messages) {
      for (const catalog of [zhTW, zhCN]) assert.ok(Object.hasOwn(catalog, message), message)
    }
  }
})

test('Home, routing and diagnostics share one recovery panel and checks avoid ownership fallback', () => {
  for (const file of [
    'src/renderer/src/pages/home.tsx',
    'src/renderer/src/pages/app-routing.tsx',
    'src/renderer/src/components/sysproxy/system-proxy-diagnostics-modal.tsx'
  ]) {
    assert.match(readFileSync(file, 'utf8'), /<RuntimeRecoveryPanel/)
  }
  const panel = readFileSync(
    'src/renderer/src/components/runtime/runtime-recovery-panel.tsx',
    'utf8'
  )
  assert.match(panel, /const latest = await mutate\(\)/)
  assert.match(panel, /issue\?\.actions\.includes\(action\)/)
  assert.doesNotMatch(panel, /mutateCache\('mihomoVersion'\)/)
  assert.match(panel, /snapshot && !error/)
  assert.match(panel, /await refreshAppRoutingStatus\(\)/)
})

test('compact recovery keeps healthy checks inside a closed disclosure', () => {
  const guidance = buildRuntimeRecoveryGuidance(fixture('running', false))
  assert.equal(guidance.issue, undefined)
  const html = renderToStaticMarkup(
    <RecoveryGuidance compact guidance={guidance} onAction={() => {}} />
  )
  const disclosure = html.match(/<details\b[\s\S]*?<\/details>/)?.[0]
  assert.ok(disclosure)
  assert.doesNotMatch(disclosure.match(/<details\b[^>]*>/)![0], /\bopen(?:=|\s|>)/)
  assert.match(disclosure, /<summary[\s\S]*No issues detected[\s\S]*<\/summary>/)
  assert.match(disclosure, /data-recovery-layer="routing-endpoint"/)
  assert.match(html.replace(disclosure, ''), /Check again/)
  for (const catalog of [zhTW, zhCN]) assert.ok(Object.hasOwn(catalog, 'No issues detected'))
})

test('compact recovery exposes the problem and primary repair without expanding details', () => {
  const guidance = buildRuntimeRecoveryGuidance(fixture('degraded', false))
  const html = renderToStaticMarkup(
    <RecoveryGuidance compact guidance={guidance} busy onAction={() => {}} />
  )
  const summary = html.match(/<summary\b[\s\S]*?<\/summary>/)?.[0]
  assert.ok(summary?.includes(guidance.issue!.title))
  const collapsed = html.replace(/<details\b[\s\S]*?<\/details>/, '')
  assert.match(collapsed, /Restart core/)
  assert.match(collapsed, /Check again/)
  assert.match(html, /data-recovery-cause="routing-endpoint"/)
  for (const button of html.matchAll(/<button\b[^>]*>/g)) assert.match(button[0], /disabled=""/)
})
