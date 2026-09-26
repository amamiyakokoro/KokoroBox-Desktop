export function normalizeAccentColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : undefined
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

export function accentTextColor(hex: string): string {
  return luminance(hex) > 0.179 ? '#000000' : '#ffffff'
}

export function accentVariables(color: unknown, dark: boolean): Record<string, string> {
  const accent = normalizeAccentColor(color)
  if (!accent) return {}
  const foreground = accentTextColor(accent)
  return {
    '--accent': accent,
    '--accent-foreground': foreground,
    '--accent-hover': `color-mix(in oklab, ${accent} 90%, ${foreground} 10%)`,
    '--accent-soft': `color-mix(in oklab, ${accent} ${dark ? 12 : 15}%, transparent)`,
    '--accent-soft-hover': `color-mix(in oklab, ${accent} ${dark ? 16 : 20}%, transparent)`,
    '--accent-soft-foreground': `color-mix(in oklab, ${accent} ${dark ? 65 : 50}%, ${dark ? '#ffffff' : '#000000'})`,
    '--focus': accent,
    '--selection': accent,
    '--selection-foreground': foreground
  }
}
