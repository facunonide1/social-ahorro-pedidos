import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges class names with tailwind-merge so that conflicting Tailwind
 * classes (e.g. `px-2 px-4`) collapse correctly. Use this in every
 * shadcn-style component instead of plain template strings.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
