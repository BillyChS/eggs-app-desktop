/** Enough for this business, and far from where a JavaScript number stops being exact. */
export const MAX_COLONES = 999_999_999_999

export type ParsedColones =
  | { kind: 'empty' }
  | { kind: 'ok'; value: number }
  | { kind: 'decimals' }
  | { kind: 'tooLarge' }
  | { kind: 'invalid' }

/** Thousands with dots. Written by hand because Intl gives "12 500" for es-CR and "1500" for es. */
export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** 12500 → "₡12.500" */
export function formatColones(value: number): string {
  const whole = Math.round(value)
  const sign = whole < 0 ? '-' : ''
  return `${sign}₡${groupThousands(Math.abs(whole).toString())}`
}

/**
 * Reads an amount someone typed or pasted. Accepts "12500", "12.500", "12,500" and "₡12.500".
 * Anything with céntimos is refused rather than losing the separator, which would make 12500,50 into ₡1.250.050.
 */
export function parseColones(text: string): ParsedColones {
  const cleaned = text.replace(/[₡\s]/g, '').replace(/[.,]$/, '')

  if (cleaned === '') {
    return { kind: 'empty' }
  }

  const isPlain = /^\d+$/.test(cleaned)
  const isGrouped = /^[1-9]\d{0,2}((\.\d{3})+|(,\d{3})+)$/.test(cleaned)

  if (isPlain || isGrouped) {
    const value = Number(cleaned.replace(/[.,]/g, ''))
    return value > MAX_COLONES ? { kind: 'tooLarge' } : { kind: 'ok', value }
  }

  return /^[\d.,]*[.,]\d+$/.test(cleaned) ? { kind: 'decimals' } : { kind: 'invalid' }
}
