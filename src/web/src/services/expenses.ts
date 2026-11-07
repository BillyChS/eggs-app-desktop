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

export interface Expense {
  id: string
  /** Local YYYY-MM-DD. */
  date: string
  category: ExpenseCategory
  amount: number
  note: string | null
}

export interface ExpenseInput {
  date: string
  categoryId: string
  amount: number
  note: string
}

export interface ExpenseList {
  expenses: Expense[]
  /** What went out in the period, on the days it was spent. */
  total: number
}

const BASE = '/api/expenses'

/** The categories a new expense can use, in button order. */
export function listExpenseCategories(signal?: AbortSignal): Promise<ExpenseCategory[]> {
  return request<ExpenseCategory[]>('/api/expense-categories', { signal })
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
