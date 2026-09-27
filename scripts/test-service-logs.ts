import assert from 'node:assert/strict'
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseServiceLogs, validateServiceLogSnapshot } from '../src/shared/service-log'
import { readServiceLogFile, serviceLogPaths } from '../src/main/service/log-file'

function snapshot(content: string, session = 'session', offset = 0) {
  return { session, offset, end: offset + Buffer.byteLength(content), content }
}

test('pretty JSON service logs retain levels, timestamps and structured diagnostics', () => {
  const raw = JSON.stringify(
    {
      ts: '2026-09-27T12:02:03.404+0800',
      level: 'warn',
      msg: '未初始化 {"key"}',
      caller: 'route/server.go:62',
      status: { state: 'not-initialized', error: 'missing key' },
      addresses: ['localhost', '127.0.0.1']
    },
    null,
    2
  )
  const [entry] = parseServiceLogs(snapshot(`${raw}\n`))
  assert.equal(entry.type, 'warning')
  assert.equal(entry.time, '2026-09-27T12:02:03.404+0800')
  assert.match(entry.payload, /未初始化 \{"key"\}/)
  assert.match(entry.payload, /caller="route\/server.go:62"/)
  assert.match(entry.payload, /status=\{"state":"not-initialized","error":"missing key"\}/)
  assert.match(entry.payload, /addresses=\["localhost","127.0.0.1"\]/)
})

test('service logs wait for partial writes and handle stderr mixed with JSON', () => {
  const first = '{"level":"error","msg":"first"}\n'
  const partial = '{\n  "level": "info",\n  "msg": "next'
  assert.equal(parseServiceLogs(snapshot(first + partial)).length, 1)
  const completed = snapshot(first + partial + '"\n}\npanic: crash\nstack line\n')
  assert.deepEqual(
    parseServiceLogs(completed).map((entry) => [entry.type, entry.payload]),
    [
      ['error', 'first'],
      ['info', 'next'],
      ['error', 'panic: crash'],
      ['info', 'stack line']
    ]
  )
})

test('bounded tails ignore partial JSON and use UTF-8 byte positions when clearing', () => {
  const head = '  "state": "partial"\n  },\n  "msg": "partial"\n}\n'
  const record = '{"msg":"服務已啟動"}\n'
  const initial = snapshot(head + record, 'session', 100)
  const entries = parseServiceLogs(initial)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].offset, 100 + Buffer.byteLength(head))
  const cursor = { session: initial.session, end: initial.end }
  const appended = snapshot(initial.content + '{"msg":"new"}\n', 'session', 100)
  assert.deepEqual(
    parseServiceLogs(appended, cursor).map((entry) => entry.payload),
    ['new']
  )
  assert.equal(parseServiceLogs(snapshot(record, 'restarted'), cursor).length, 1)
})

test('a UTF-8 tail cut does not corrupt subsequent entry IDs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kokorobox-log-test-'))
  const path = join(directory, 'service.log')
  try {
    const content = '中'.repeat(200_000) + '\n{"msg":"last"}\n'
    await writeFile(path, content)
    const tail = await readServiceLogFile([path])
    assert.ok(!tail.content.includes('\uFFFD'))
    assert.equal(tail.offset + Buffer.byteLength(tail.content), tail.end)
    const [entry] = parseServiceLogs(tail)
    assert.equal(entry.offset, Buffer.byteLength(content) - Buffer.byteLength('{"msg":"last"}\n'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('file fallback bounds reads, preserves diagnostics and follows service rotation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kokorobox-log-test-'))
  const path = join(directory, 'kokorobox-service.log')
  try {
    assert.equal((await readServiceLogFile([path])).content, '')
    const content = 'x'.repeat(600 * 1024) + '\n{"msg":"last"}\n'
    await writeFile(path, content)
    const first = await readServiceLogFile([path])
    assert.equal(first.end, Buffer.byteLength(content))
    assert.ok(Buffer.byteLength(first.content) <= 512 * 1024)
    assert.equal(await readFile(path, 'utf8'), content)
    await rename(path, path + '.previous')
    await writeFile(path, '{"msg":"restarted"}\n')
    const next = await readServiceLogFile([path])
    assert.notEqual(first.session, next.session)
    assert.deepEqual(
      parseServiceLogs(next).map((entry) => entry.payload),
      ['restarted']
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('service paths include the SYSTEM temp directories rather than only user temp', () => {
  assert.deepEqual(
    serviceLogPaths('win32', { SystemRoot: 'D:\\Windows' }, 'D:\\Users\\user\\Temp'),
    [
      'D:\\Windows\\SystemTemp\\kokorobox-service.log',
      'D:\\Windows\\Temp\\kokorobox-service.log',
      'D:\\Users\\user\\Temp\\kokorobox-service.log'
    ]
  )
  assert.equal(serviceLogPaths('linux', {}, '/tmp')[0], '/tmp/kokorobox-service.log')
})

test('invalid or oversized service snapshots are rejected', () => {
  assert.throws(() => validateServiceLogSnapshot({ ...snapshot(''), offset: -1 }))
  assert.throws(() => validateServiceLogSnapshot({ ...snapshot(''), end: 512 * 1024 + 1 }))
  assert.throws(() => validateServiceLogSnapshot({ ...snapshot(''), session: null }))
  assert.deepEqual(validateServiceLogSnapshot(snapshot('log\n')), snapshot('log\n'))
})
