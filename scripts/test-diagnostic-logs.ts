import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createNativeSidecarLogReader,
  diagnosticLogLevel,
  isDiagnosticLogVisible,
  nativeLogLine
} from '../src/shared/diagnostic-log'

test('routing levels support older services and threshold filters', () => {
  assert.equal(diagnosticLogLevel(undefined), 'info')
  assert.equal(diagnosticLogLevel('warn'), 'warning')
  assert.equal(diagnosticLogLevel('fatal'), 'error')
  assert.equal(diagnosticLogLevel('debug'), 'debug')
  assert.ok(isDiagnosticLogVisible('error', 'warning'))
  assert.ok(!isDiagnosticLogVisible('info', 'warning'))
  assert.ok(!isDiagnosticLogVisible('debug', 'info'))
  assert.ok(isDiagnosticLogVisible('debug', 'debug'))
  assert.ok(!isDiagnosticLogVisible('error', 'silent'))
})

test('Native records preserve timestamps, severity and data without line injection', () => {
  const line = nativeLogLine({
    timestamp: 1000,
    level: 'warn',
    target: 'presenter',
    msg: '中文\n{"forged":true}'
  })!
  const entry = JSON.parse(line)
  assert.equal(entry.ts, '1970-01-01T00:00:01.000Z')
  assert.equal(entry.level, 'warning')
  assert.equal(entry.source, 'kokorobox-native')
  assert.equal(entry.msg, '中文\n{"forged":true}')
  assert.equal(line.split('\n').length, 2)
  assert.equal(nativeLogLine({ msg: '' }), undefined)
  assert.equal(nativeLogLine(null), undefined)
  assert.doesNotThrow(() => nativeLogLine({ msg: 'test', timestamp: Infinity }))
})

test('sidecar stderr handles split and combined records, legacy text and incomplete endings', () => {
  const lines: string[] = []
  const reader = createNativeSidecarLogReader((line) => lines.push(line), 'traffic-presenter')
  reader.push('{"level":"warn","msg":"taskbar')
  assert.equal(lines.length, 0)
  reader.push(' unavailable","timestamp":1000}\n{"level":"error","msg":"failed"}\nold error')
  assert.deepEqual(
    lines.map((line) => JSON.parse(line).level),
    ['warning', 'error']
  )
  reader.flush()
  assert.equal(JSON.parse(lines[2]).target, 'traffic-presenter')
  assert.equal(JSON.parse(lines[2]).msg, 'old error')
  reader.push('x'.repeat(20_000))
  reader.push('\n{"msg":"recovered"}\n')
  assert.equal(JSON.parse(lines[3]).level, 'warning')
  assert.equal(JSON.parse(lines[4]).msg, 'recovered')
})
