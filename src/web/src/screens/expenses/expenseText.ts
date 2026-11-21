import { formatDateLong } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import type { Expense, ExpenseCategory } from '../../services/expenses'
import { foldText } from '../sales/salesSearch'

// Must match ExpenseCategory.cs and CategoryNames.cs. The API checks them too.
export const TYPE_NAME_MAX_LENGTH = 40
export const TYPE_NAME_TOO_LONG = `El nombre no puede tener más de ${TYPE_NAME_MAX_LENGTH} letras.`
export const TYPE_NAME_IS_OTHER = 'Escriba qué gasto fue, no «Otro».'

export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * What it was: its category, or for an expense saved under "Otro" before "Otro" made types of its own, what was
 * typed in "¿Qué gasto fue?" (kept as its note).
 */
export const kindOf = (expense: Expense) =>
  expense.category.needsDescription && expense.note ? expense.note : expense.category.name

/** The note to show next to it: an old "Otro"'s note is what it was, already shown as its kind. */
export const noteOf = (expense: Expense) => (expense.category.needsDescription ? null : expense.note)

export const deleteQuestion = (expense: Expense) =>
  `¿Borrar el gasto de ${kindOf(expense)} de ${formatColones(expense.amount)} del ${formatDateLong(expense.date)}?`

/** A type's name as the API saves it: no extra spaces, and a capital first letter. */
export function cleanTypeName(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ')
  return clean.charAt(0).toLocaleUpperCase('es-CR') + clean.slice(1)
}

/** What's wrong with a cleaned type name, or undefined. */
export function typeNameProblem(clean: string, missing: string): string | undefined {
  return !clean
    ? missing
    : clean.length > TYPE_NAME_MAX_LENGTH
      ? TYPE_NAME_TOO_LONG
      : foldText(clean) === 'otro'
        ? TYPE_NAME_IS_OTHER
        : undefined
}

/** The type that already has this name, compared as the API does: without case or accents. */
export const sameType = <T extends ExpenseCategory>(types: T[], name: string): T | undefined =>
  types.find((type) => !type.needsDescription && foldText(type.name) === foldText(name))

type Sortable = Pick<ExpenseCategory, 'name' | 'needsDescription'>

/** Alphabetically, as Spanish sorts, with "Otro" last: the order of every list of types. */
export const byTypeOrder = (a: Sortable, b: Sortable) =>
  Number(a.needsDescription) - Number(b.needsDescription) ||
  a.name.localeCompare(b.name, 'es-CR', { sensitivity: 'base' })
