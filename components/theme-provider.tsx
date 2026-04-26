'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes'

/**
 * Wrapper de next-themes con defaults del proyecto.
 *
 * - attribute="class" agrega `class="dark"` al <html> en dark mode,
 *   que dispara las CSS vars del bloque `.dark` en globals.css.
 * - defaultTheme="system" respeta la preferencia del SO.
 * - enableSystem permite el toggle "system".
 * - disableTransitionOnChange evita el flicker al alternar tema.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
