import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseServiceLogs } from '../src/shared/service-log'
import { ServiceLogMessage } from '../src/renderer/src/components/logs/service-log-message'
import {
  serviceLogDuration,
  serviceLogSummary
} from '../src/renderer/src/components/logs/service-log-display'
import { fullLogText } from '../src/renderer/src/components/logs/log-actions'

function entry(value: Record<string, unknown>) {
  const content = JSON.stringify(value) + '\n'
  return parseServiceLogs({
    session: 'test',
    offset: 0,
    end: Buffer.byteLength(content),
    content
  })[0]
}

test('HTTP summaries promote request, status and duration while retaining copyable diagnostics', () => {
  const log = entry({
    ts: '2026-10-06T15:48:09+08:00',
    level: 'info',
    msg: 'HTTP request completed',
    method: 'POST',
    path: '/sysproxy/renew',
    route: '/sysproxy/renew',
    status: 204,
    duration: '936.5µs',
    duration_ms: 0.9365,
    bytes: 0,
    caller: 'http/server.go:2286'
  })
  const summary = serviceLogSummary(log.fields!)
  assert.deepEqual(summary.request, { method: 'POST', path: '/sysproxy/renew' })
  assert.equal(summary.duration, '0.936 ms')
  assert.equal(summary.status, 204)
  assert.deepEqual(summary.details, [
    ['bytes', 0],
    ['caller', 'http/server.go:2286']
  ])
  const html = renderToStaticMarkup(<ServiceLogMessage entry={log} />)
  assert.match(html, />POST<\/span>/)
  assert.match(html, />\/sysproxy\/renew<\/span>/)
  assert.match(html, /text-success[^>]*title="HTTP 204"/)
  assert.match(html, /<details /)
  assert.doesNotMatch(html, /<details[^>]* open/)
  assert.match(html, /<dt>bytes<\/dt><dd[^>]*>0<\/dd>/)
  assert.match(fullLogText(log), /route="\/sysproxy\/renew".*status=204/)
  assert.match(fullLogText(log), /duration_ms=0.9365/)
})

test('HTTP failures and general service errors remain visible without expanding details', () => {
  for (const [status, tone] of [
    [401, 'text-warning-soft-foreground'],
    [500, 'text-danger']
  ] as const) {
    const html = renderToStaticMarkup(
      <ServiceLogMessage
        entry={entry({
          msg: 'request failed',
          method: 'GET',
          route: '/core',
          status,
          error: 'access denied',
          caller: 'server.go:1'
        })}
      />
    )
    assert.match(html, new RegExp(`${tone}[^>]*title="HTTP ${status}"`))
    assert.ok(html.indexOf('access denied') < html.indexOf('<details'))
  }
  const log = entry({
    msg: 'guard repair failed',
    error: '<script>alert(1)</script>',
    state: 'degraded',
    pid: 0,
    context: { active: false }
  })
  const html = renderToStaticMarkup(<ServiceLogMessage entry={log} />)
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>/)
  assert.ok(html.indexOf('degraded') < html.indexOf('<details'))
  assert.match(html, /active.*false/)
})

test('duration formatting handles zero, tiny values, seconds and invalid measurements', () => {
  assert.equal(serviceLogDuration({ duration_ms: 0 }), '0 ms')
  assert.equal(serviceLogDuration({ duration_ms: 0.00012 }), '0.00012 ms')
  assert.equal(serviceLogDuration({ duration_ms: 1250 }), '1.25 s')
  assert.equal(serviceLogDuration({ duration_ms: -1 }), undefined)
  assert.equal(serviceLogDuration({ duration_ms: NaN, duration: 'unavailable' }), 'unavailable')
  const summary = serviceLogSummary({ method: false, path: 12, status: 'starting', extra: false })
  assert.equal(summary.request, undefined)
  assert.equal(summary.status, undefined)
  assert.deepEqual(summary.important, [['status', 'starting']])
  assert.deepEqual(summary.details, [
    ['method', false],
    ['path', 12],
    ['extra', false]
  ])
})
