import { formatDateLong } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import type { CategoryTotal, Expense } from '../../services/expenses'

export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** What it was: its category, or for "Otro", what was typed in "¿Qué gasto fue?" (kept as the note). */
export const kindOf = (expense: Expense) =>
  expense.category.needsDescription && expense.note ? expense.note : expense.category.name

/** The note to show next to it: "Otro"'s note is what it was, already shown as its kind. */
export const noteOf = (expense: Expense) => (expense.category.needsDescription ? null : expense.note)

export const deleteQuestion = (expense: Expense) =>
  `¿Borrar el gasto de ${kindOf(expense)} de ${formatColones(expense.amount)} del ${formatDateLong(expense.date)}?`

/** At most four lines in "En qué se gastó": past four categories, the top three and "Lo demás (N tipos)". */
export function topCategories(byCategory: CategoryTotal[]): { name: string; total: number }[] {
  if (byCategory.length <= 4) {
    return byCategory
  }

  const rest = byCategory.slice(3)
  return [
    ...byCategory.slice(0, 3),
    { name: `Lo demás (${rest.length} tipos)`, total: rest.reduce((sum, category) => sum + category.total, 0) },
  ]
}
