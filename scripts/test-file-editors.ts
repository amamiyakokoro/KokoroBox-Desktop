import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

interface Element {
  type: unknown
  props: Record<string, unknown> & { children?: unknown }
}
interface Slot {
  value?: unknown
  deps?: unknown[]
  cleanup?: () => void
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
const tick = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve)
  })

// Run the actual components with a minimal hook/JSX host and isolated IPC.
// Effects and renders are separate so source changes can be checked before effects run.
function fixture(file: string, initialProps: Record<string, unknown>) {
  const slots: Slot[] = []
  let cursor = 0
  let dirty = false
  let props = initialProps
  let tree: Element
  let effects: Array<() => void> = []
  const reads: Array<ReturnType<typeof deferred<string>> & { args: unknown[] }> = []
  const writes: unknown[][] = []
  const errors: unknown[] = []
  const saved = deferred<void>()
  const changed = (slot: Slot, deps: unknown[]) =>
    !slot.deps || deps.some((value, index) => !Object.is(value, slot.deps![index]))
  const react = {
    createElement: (type: unknown, attributes: object | null, ...children: unknown[]): Element => ({
      type,
      props: { ...attributes, children }
    }),
    useState: (initial: unknown) => {
      const index = cursor++
      const slot = (slots[index] ??= { value: initial })
      return [
        slot.value,
        (next: unknown) => {
          slot.value = typeof next === 'function' ? next(slot.value) : next
          dirty = true
        }
      ]
    },
    useMemo: (create: () => unknown, deps: unknown[]) => {
      const slot = (slots[cursor++] ??= {})
      if (changed(slot, deps)) {
        slot.value = create()
        slot.deps = deps
      }
      return slot.value
    },
    useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
      const slot = (slots[cursor++] ??= {})
      if (!changed(slot, deps)) return
      slot.deps = deps
      effects.push(() => {
        slot.cleanup?.()
        slot.cleanup = effect()
      })
    }
  }
  const read = (...args: unknown[]) => {
    const pending = { ...deferred<string>(), args }
    reads.push(pending)
    return pending.promise
  }
  const write = async (...args: unknown[]) => {
    writes.push(args)
    await saved.promise
  }
  const parts = (name: string, names: string[]) =>
    Object.assign(() => {}, Object.fromEntries(names.map((part) => [part, `${name}.${part}`])))
  const dependencies: Record<string, unknown> = {
    react,
    '@heroui/react': {
      Button: 'Button',
      Spinner: 'Spinner',
      Label: 'Label',
      Modal: parts('Modal', [
        'Backdrop',
        'Container',
        'Dialog',
        'Header',
        'Heading',
        'Body',
        'Footer',
        'CloseTrigger'
      ]),
      Switch: parts('Switch', ['Content', 'Control', 'Thumb'])
    },
    '../../../../shared/i18n': { tr: (value: string) => value },
    '../../../../shared/build-flags': { systemCoreOnlyBuild: false },
    '../base/base-editor-lazy': { BaseEditor: 'Editor' },
    '../base/text-viewer': { TextViewer: 'TextViewer' },
    '../base/base-confirm': { default: 'Confirm', __esModule: true },
    '@renderer/utils/notification': { notify: (error: unknown) => errors.push(error) },
    '@renderer/utils/override': { isOverrideUsedByCurrentProfile: () => false },
    '@renderer/hooks/use-app-config': { useAppConfig: () => ({}) },
    '@renderer/hooks/use-override-config': { useOverrideConfig: () => ({}) },
    '@renderer/hooks/use-profile-config': { useProfileConfig: () => ({}) },
    'react-router-dom': { useNavigate: () => () => {} },
    'js-yaml': { load: () => undefined },
    '@renderer/utils/ipc': {
      getProfileStr: read,
      getOverride: read,
      getFileStr: read,
      getFilePreviewStr: read,
      setProfileStr: write,
      setOverride: write,
      setFileStr: write,
      saveFileStrWithElevation: write
    }
  }
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true
    }
  }).outputText
  const exports: { default?: (props: object) => Element } = {}
  new Function('require', 'exports', code)((name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, exports)
  function render(next = props) {
    props = next
    cursor = 0
    dirty = false
    tree = exports.default!(props)
  }
  function commit() {
    for (let attempts = 0; effects.length || dirty; attempts++) {
      assert.ok(attempts < 20, 'render loop')
      const pending = effects
      effects = []
      for (const effect of pending) effect()
      render()
    }
  }
  function elements(value: unknown = tree): Element[] {
    if (Array.isArray(value)) return value.flatMap((child) => elements(child))
    if (!value || typeof value !== 'object' || !('props' in value)) return []
    const element = value as Element
    return [element, ...elements(element.props.children)]
  }
  const button = (label: string) =>
    elements().find(
      (element) =>
        element.type === 'Button' && (element.props.children as unknown[]).includes(label)
    )
  render()
  commit()
  return {
    reads,
    writes,
    errors,
    saved,
    render,
    commit,
    button,
    editor: () => elements().find((element) => element.type === 'Editor')
  }
}

const editors = [
  {
    name: 'profile',
    file: 'profiles/edit-file-modal.tsx',
    props: { id: 'first', isRemote: false },
    next: { id: 'second' },
    expected: ['second', 'second content']
  },
  {
    name: 'override',
    file: 'override/edit-file-modal.tsx',
    props: { id: 'first', language: 'yaml' },
    next: { id: 'second' },
    expected: ['second', 'yaml', 'second content']
  },
  {
    name: 'resource',
    file: 'resources/viewer.tsx',
    props: { path: 'first', type: 'File', title: 'File', providerType: '' },
    next: { path: 'second' },
    expected: ['second', 'second content']
  }
]

for (const editor of editors) {
  const create = () =>
    fixture(`src/renderer/src/components/${editor.file}`, { ...editor.props, onClose: () => {} })

  test(`${editor.name}: pending and failed reads cannot overwrite a file; retry accepts an empty file`, async () => {
    const f = create()
    assert.ok(!f.button('Save') || f.button('Save')!.props.isDisabled)
    await (f.button('Save')?.props.onPress as (() => Promise<void>) | undefined)?.()
    assert.equal(f.writes.length, 0)
    const failure = new Error('read or decryption failed')
    f.reads[0].reject(failure)
    await tick()
    f.commit()
    assert.deepEqual(f.errors, [failure])
    assert.equal(f.editor(), undefined)
    assert.equal(f.button('Save')!.props.isDisabled, true)
    await (f.button('Save')!.props.onPress as () => Promise<void>)()
    assert.equal(f.writes.length, 0)
    ;(f.button('Retry')!.props.onPress as () => void)()
    f.commit()
    f.reads[1].resolve('')
    await tick()
    f.commit()
    assert.equal(f.editor()!.props.value, '')
    assert.equal(f.button('Save')!.props.isDisabled, false)
    const saving = (f.button('Save')!.props.onPress as () => Promise<void>)()
    f.commit()
    assert.equal(f.button('Save')!.props.isDisabled, true)
    assert.equal(f.writes.length, 1)
    assert.equal(f.writes[0].at(-1), '')
    f.saved.resolve()
    await saving
  })

  test(`${editor.name}: late reads from a previous source cannot unlock or overwrite the new source`, async () => {
    const f = create()
    f.render({ ...editor.props, ...editor.next, onClose: () => {} })
    f.commit()
    f.reads[0].resolve('stale content')
    await tick()
    f.commit()
    assert.equal(f.editor(), undefined)
    assert.ok(!f.button('Save') || f.button('Save')!.props.isDisabled)
    f.reads[1].resolve('second content')
    await tick()
    f.commit()
    const saving = (f.button('Save')!.props.onPress as () => Promise<void>)()
    assert.deepEqual(f.writes, [editor.expected])
    f.saved.resolve()
    await saving
  })

  test(`${editor.name}: changing a loaded source blocks saving before its load effect runs`, async () => {
    const f = create()
    f.reads[0].resolve('first content')
    await tick()
    f.commit()
    assert.equal(f.button('Save')!.props.isDisabled, false)
    f.render({ ...editor.props, ...editor.next, onClose: () => {} })
    assert.equal(f.button('Save')!.props.isDisabled, true)
    await (f.button('Save')!.props.onPress as () => Promise<void>)()
    assert.equal(f.writes.length, 0)
  })
}

test('override language and resource decryption key changes invalidate loaded content', async () => {
  for (const [editor, next] of [
    [editors[1], { language: 'javascript' }],
    [editors[2], { ageSecretKey: 'new-key' }]
  ] as const) {
    const f = fixture(`src/renderer/src/components/${editor.file}`, {
      ...editor.props,
      onClose: () => {}
    })
    f.reads[0].resolve('old content')
    await tick()
    f.commit()
    f.render({ ...editor.props, ...next, onClose: () => {} })
    assert.equal(f.button('Save')!.props.isDisabled, true)
    f.commit()
    assert.equal(f.reads.length, 2)
  }
})
