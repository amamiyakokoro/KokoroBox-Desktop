import yaml, { isPair, isScalar } from 'yaml'

export function parseYaml<T = unknown>(content: string): T {
  const document = yaml.parseDocument(content, { merge: true })
  if (document.errors.length > 0) throw document.errors[0]

  yaml.visit(document, {
    Pair(_key, pair, path) {
      if (!isScalar(pair.key) || pair.key.value !== 'short-id') return
      const inRealityOptions = path.some(
        (node) => isPair(node) && isScalar(node.key) && node.key.value === 'reality-opts'
      )
      if (!inRealityOptions || !isScalar(pair.value)) return
      const value = pair.value
      // Use the original scalar spelling, before numeric conversion loses zeros
      // or precision. Keep explicit YAML types, nulls and strings unchanged.
      if (value.value === null || typeof value.value === 'string' || value.tag) return
      if (value.source === undefined) return
      value.value = value.source
      value.tag = 'tag:yaml.org,2002:str'
    }
  })

  return (document.toJS() || {}) as T
}

export function stringifyYaml(data: unknown): string {
  return yaml.stringify(data)
}
