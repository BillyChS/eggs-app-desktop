/** Lowercase, without accents or extra spaces, so "maria" finds "María" and "  rosa " finds "Rosa". */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const digitsOf = (text: string) => text.replace(/\D/g, '')

/**
 * Whether a row matches what was typed in "Buscar por nombre o teléfono": the name, ignoring accents and case, or the
 * phone, ignoring dashes and spaces, so "88124455" finds "8812-4455". Nothing typed matches everything.
 */
export function matchesSearch(name: string, phone: string | null | undefined, search: string): boolean {
  const wanted = foldText(search)

  if (!wanted) {
    return true
  }

  if (foldText(name).includes(wanted)) {
    return true
  }

  const digits = digitsOf(wanted)
  // Only when what was typed is a phone number, so a name with a digit in it doesn't match every phone.
  return digits.length > 0 && digits === wanted.replace(/[\s-]/g, '') && digitsOf(phone ?? '').includes(digits)
}
