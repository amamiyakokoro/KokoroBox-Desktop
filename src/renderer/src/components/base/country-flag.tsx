import { LuGlobe } from 'react-icons/lu'
import { countryFlagAssetKey } from '../../../../shared/home'

const flagAssets = import.meta.glob<string>('../../assets/circle-flags/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
})

export function countryFlagAsset(code: unknown): string | undefined {
  const assetKey = countryFlagAssetKey(code)
  return assetKey ? flagAssets[assetKey] : undefined
}

export function CountryFlag({
  code,
  className = 'size-11'
}: {
  code?: string
  className?: string
}) {
  const src = countryFlagAsset(code)
  return src ? (
    <img src={src} alt="" aria-hidden="true" className={`${className} shrink-0`} />
  ) : (
    <span
      aria-hidden="true"
      className={`${className} inline-flex shrink-0 items-center justify-center text-muted`}
    >
      <LuGlobe className="size-3/4" />
    </span>
  )
}
