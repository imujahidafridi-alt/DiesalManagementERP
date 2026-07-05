/**
 * Utility functions for formatting and data handling
 */

/**
 * Format cents amount into human readable currency ($120.50)
 * Stores financial numbers as integers representing cents to prevent float rounding errors.
 */
import { FormattingService } from './FormattingService'

export function formatCurrency(cents: number): string {
  return FormattingService.formatCurrency(cents)
}

/**
 * Format ISO date string into readable text (e.g. "Jul 5, 2026")
 */
export function formatDate(isoString: string): string {
  if (!isoString) return '-'
  try {
    const date = new Date(isoString)
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date)
  } catch {
    return '-'
  }
}

/**
 * Format ISO datetime string to include time (e.g. "Jul 5, 2026, 01:45 PM")
 */
export function formatDateTime(isoString: string): string {
  if (!isoString) return '-'
  try {
    const date = new Date(isoString)
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date)
  } catch {
    return '-'
  }
}

/**
 * Format numbers with specified decimals (e.g. quantities of diesel)
 */
export function formatNumber(value: number, decimals = 2): string {
  if (value === undefined || value === null) return '0.00'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/**
 * Safe UUID generator helper for client-side items
 */
export function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID()
  }
  // Fallback UUID generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Parse currency strings back to integer cents
 */
export function parseCurrencyToCents(amount: string | number): number {
  if (typeof amount === 'number') return Math.round(amount * 100)
  const clean = amount.replace(/[^0-9.-]/g, '')
  const floatVal = parseFloat(clean)
  return isNaN(floatVal) ? 0 : Math.round(floatVal * 100)
}
