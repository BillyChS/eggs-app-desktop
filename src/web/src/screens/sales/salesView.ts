import { useSearchParams } from 'react-router'
import { listPeriodParams, periodAfterSave, readListPeriod } from '../periodView'
import type { Period } from '../summaries/periods'

const LIST = '/ventas'

/** The tabs of Ventas. Abonos are there too: they're money that came in, so the page that counts them lists them. */
export type SalesTab = 'fiado' | 'contado' | 'abonos'

const TABS: SalesTab[] = ['fiado', 'contado', 'abonos']

/** What Ventas shows: one day, week or month, and one tab of it. */
export interface SalesView {
  period: Period
  tab: SalesTab
}

/**
 * The view in an address: the period as `periodView` says it ("?fecha=2026-11-07", "?semana=2026-11-02" or
 * "?mes=2026-11"), and "&pestana=fiado". Anything that can't be shown means today, on Contado, which is also what the
 * app opens on.
 */
export function readView(params: URLSearchParams): SalesView {
  const tab = TABS.find((candidate) => candidate === params.get('pestana')) ?? 'contado'
  return { period: readListPeriod(params), tab }
}

export function viewParams({ period, tab }: SalesView): Record<string, string> {
  const when = listPeriodParams(period)
  return tab === 'contado' ? when : { ...when, pestana: tab }
}

/** "?fecha=…" and so on, to carry the view to a screen opened from it and back. */
export const viewQuery = (view: SalesView) => `?${new URLSearchParams(viewParams(view))}`

export const viewAddress = (view: SalesView) => `${LIST}${viewQuery(view)}`

/** Ventas on the day of a sale. */
export const listOfDay = (day: string, tab: SalesTab = 'contado') =>
  viewAddress({ period: { kind: 'day', start: day }, tab })

/**
 * Where to go once a sale is saved: the week or month it was opened from if the sale is in it, otherwise the sale's
 * day, and always on the sale's own tab, so the sale just saved is there to see.
 */
export function viewAfterSave(from: SalesView, date: string, isCredit: boolean): string {
  return viewAddress({ period: periodAfterSave(from.period, date), tab: isCredit ? 'fiado' : 'contado' })
}

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
