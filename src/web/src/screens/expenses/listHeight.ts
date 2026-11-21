// The most rows in sight; more scroll.
const MAX_ROWS = 6
// The fewest rows in sight when they don't all fit: below that, the list overlaps the edge instead.
const MIN_ROWS = 2.5

/**
 * How tall Filtrar's list can be with `room` for it: all of it when every row fits, otherwise whole rows and half of
 * the next one, so the cut row shows there are more types below. A cut between two rows looks like the end of the list.
 */
export function listMaxHeight(room: number, count: number, row: number): number | undefined {
  const fit = Math.min(Math.floor(room / row), MAX_ROWS)

  if (count <= fit) {
    return undefined
  }

  return Math.max(Math.min(Math.floor(room / row - 0.5), MAX_ROWS - 1) + 0.5, MIN_ROWS) * row
}
