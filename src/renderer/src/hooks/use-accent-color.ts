import { useLayoutEffect } from 'react'
import { useTheme } from 'next-themes'
import { accentVariables } from '@renderer/utils/accent-color'

export function useAccentColor(color: unknown): void {
  const { resolvedTheme } = useTheme()
  useLayoutEffect(() => {
    const style = document.documentElement.style
    const variables = accentVariables(color, resolvedTheme === 'dark')
    for (const [name, value] of Object.entries(variables)) style.setProperty(name, value)
    return () => {
      for (const name of Object.keys(variables)) style.removeProperty(name)
    }
  }, [color, resolvedTheme])
}
