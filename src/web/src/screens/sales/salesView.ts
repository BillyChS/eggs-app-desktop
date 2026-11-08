import { useSearchParams } from 'react-router'
import { formatDateLong, todayLocal } from '../../lib/dates'
import { periodOf, type Period } from '../summaries/periods'

const LIST = '/ventas'
const EARLIEST_DAY = '2000-01-01'

/** The tabs of Ventas. Abonos are there too: they're money that came in, so the page that counts them lists them. */
export type SalesTab = 'fiado' | 'contado' | 'abonos'

const TABS: SalesTab[] = ['fiado', 'contado', 'abonos']

/** What Ventas shows: one day or one month, and one tab of it. */
export interface SalesView {
  period: Period & { kind: 'day' | 'month' }
  tab: SalesTab
}

/** A real date that can have sales. Comparing as text works because they're all YYYY-MM-DD. */
export function canHaveSales(day: string): boolean {
  return formatDateLong(day) !== null && day >= EARLIEST_DAY && day <= todayLocal()
}

/**
 * The view in an address: "?fecha=2026-11-07" or "?mes=2026-11", and "&pestana=fiado". Anything that can't be shown
 * means today, on Contado, which is also what the app opens on.
 */
export function readView(params: URLSearchParams, today = todayLocal()): SalesView {
  const tab = TABS.find((candidate) => candidate === params.get('pestana')) ?? 'contado'
  const day = params.get('fecha')
  const month = params.get('mes')

  if (month && /^\d{4}-\d{2}$/.test(month) && canHaveSales(`${month}-01`)) {
    return { period: { kind: 'month', start: `${month}-01` }, tab }
  }

  if (day && canHaveSales(day)) {
    return { period: { kind: 'day', start: day }, tab }
  }

  return { period: { kind: 'day', start: today }, tab }
}

export function viewParams({ period, tab }: SalesView): Record<string, string> {
  const when: Record<string, string> = period.kind === 'month' ? { mes: period.start.slice(0, 7) } : { fecha: period.start }
  return tab === 'contado' ? when : { ...when, pestana: tab }
}

/** "?fecha=…" and so on, to carry the view to a screen opened from it and back. */
export const viewQuery = (view: SalesView) => `?${new URLSearchParams(viewParams(view))}`

export const viewAddress = (view: SalesView) => `${LIST}${viewQuery(view)}`

/** Ventas on the day of a sale. */
export const listOfDay = (day: string, tab: SalesTab = 'contado') =>
  viewAddress({ period: { kind: 'day', start: day }, tab })

/**
 * Where to go once a sale is saved: the view it was opened from if the sale is in it, otherwise the sale's day, and
 * always on the sale's own tab, so the sale just saved is there to see.
 */
export function viewAfterSave(from: SalesView, date: string, isCredit: boolean): string {
  const tab = isCredit ? 'fiado' : 'contado'
  const inMonth = from.period.kind === 'month' && periodOf('month', date).start === from.period.start

  return inMonth ? viewAddress({ ...from, tab }) : listOfDay(date, tab)
}

/** The day a new sale starts on: the day being looked at, or today when it's a month. */
export const startDayOf = (view: SalesView) => (view.period.kind === 'day' ? view.period.start : todayLocal())

/** The view being looked at. It lives in the address, so it survives a reload. */
export function useSalesView() {
  const [params, setParams] = useSearchParams()
  const view = readView(params)

  return {
    view,
    /** Replaces the address, so that going through several days doesn't pile up in the history. */
    setView: (next: SalesView) => setParams(viewParams(next), { replace: true }),
  }
}
