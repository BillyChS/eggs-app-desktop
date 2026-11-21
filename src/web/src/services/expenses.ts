import { request } from './http'

/** What an expense was for. */
export interface ExpenseCategory {
  id: string
  name: string
  /** True for "Otro": its expenses must say what they were. */
  needsDescription: boolean
  /** No longer offered for new expenses; its old expenses still show it. */
  isRetired: boolean
}

/** A category as "Tipos de gasto" and the form's list show it. */
export interface ExpenseType extends ExpenseCategory {
  /** How many expenses use it, of any date. */
  expenseCount: number
}

export interface Expense {
  id: string
  /** Local YYYY-MM-DD. */
  date: string
  category: ExpenseCategory
  amount: number
  note: string | null
}

/** Either a category, or for "Otro" the name of the type it goes under, reused or added by the API. */
export type ExpenseInput = {
  date: string
  amount: number
  /** Optional, for any type. */
  note: string
} & ({ categoryId: string; newCategory?: undefined } | { categoryId?: undefined; newCategory: string })

/** What went to one category in a period. */
export interface CategoryTotal {
  id: string
  name: string
  total: number
  /** How many expenses. */
  count: number
}

export interface ExpenseList {
  expenses: Expense[]
  /** What went out in the period, on the days it was spent. */
  total: number
  /** The same expenses by category, largest first: what Resúmenes shows too. */
  byCategory: CategoryTotal[]
}

const BASE = '/api/expenses'

const CATEGORIES = '/api/expense-categories'

/** The categories a new expense can use, with how many expenses use each: alphabetically, "Otro" last. */
export function listExpenseCategories(signal?: AbortSignal): Promise<ExpenseType[]> {
  return request<ExpenseType[]>(CATEGORIES, { signal })
}

/** "Agregar tipo": a type with that name already (even retired) is given back instead of a new one. */
export function createExpenseCategory(name: string): Promise<ExpenseType> {
  return request<ExpenseType>(CATEGORIES, { method: 'POST', body: { name } })
}

/** Retires it: its expenses keep it, but new ones can't use it. */
export function retireExpenseCategory(id: string): Promise<void> {
  return request<void>(`${CATEGORIES}/${id}`, { method: 'DELETE' })
}

export function listExpenses(from: string, to: string, signal?: AbortSignal): Promise<ExpenseList> {
  return request<ExpenseList>(`${BASE}?${new URLSearchParams({ from, to })}`, { signal })
}

export function getExpense(id: string, signal?: AbortSignal): Promise<Expense> {
  return request<Expense>(`${BASE}/${id}`, { signal })
}

export function createExpense(input: ExpenseInput): Promise<Expense> {
  return request<Expense>(BASE, { method: 'POST', body: input })
}

export function updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
  return request<Expense>(`${BASE}/${id}`, { method: 'PUT', body: input })
}

export function deleteExpense(id: string): Promise<void> {
  return request<void>(`${BASE}/${id}`, { method: 'DELETE' })
}
