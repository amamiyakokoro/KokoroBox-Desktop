# Localization

KokoroBox uses English as the canonical source language. User-facing strings passed to `tr()` must be English string literals:

```ts
tr('Application settings')
tr('Failed to update {0}\n{1}', [profileName, url])
```

Do not use Simplified or Traditional Chinese as message keys. Do not construct keys dynamically.

## Catalogs

- `src/shared/locales/en.ts` is the canonical English source catalog.
- `src/shared/locales/zh-CN.ts` contains Simplified Chinese translations.
- `src/shared/locales/zh-TW.ts` contains Traditional Chinese translations.

All catalogs must contain exactly the same keys. The English value must equal its key so a missing runtime lookup still has a readable English fallback. When the system locale is unsupported or unavailable, KokoroBox defaults to English.

## Adding or changing text

1. Write the English source text in the `tr()` call.
2. Add the same English key to all three catalogs.
3. Preserve placeholders such as `{0}` and `{1}`, leading or trailing whitespace, and HTML tags in every translation.
4. Run `pnpm test:localization` and `pnpm typecheck`.

The localization test rejects dynamic `tr()` arguments, Chinese source keys, missing catalog entries, altered placeholders, and mismatched HTML.
