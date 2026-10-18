'use client'

import { useEffect, useState } from 'react'
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from 'next-themes'

/** SSR-safe wrapper: suppressHydrationWarning handled by class strategy on <html>. */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <>{children}</>
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
