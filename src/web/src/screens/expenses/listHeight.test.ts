import { describe, expect, it } from 'vitest'
import { listMaxHeight } from './listHeight'

const ROW = 56

describe('listMaxHeight', () => {
  it('leaves the list its own height when every type fits', () => {
    expect(listMaxHeight(400, 6, ROW)).toBeUndefined()
    expect(listMaxHeight(254, 4, ROW)).toBeUndefined()
  })

  it('cuts through the middle of a row, never between two, at 1366x768', () => {
    // Above the button of a maximized window at 1366x768: room for four and a half types.
    expect(listMaxHeight(254, 6, ROW)).toBe(4.5 * ROW)
  })

  it('shows half a row less when the next half doesn\'t fit', () => {
    expect(listMaxHeight(4.2 * ROW, 6, ROW)).toBe(3.5 * ROW)
  })

  it('shows at most five and a half types', () => {
    expect(listMaxHeight(900, 7, ROW)).toBe(5.5 * ROW)
    expect(listMaxHeight(900, 20, ROW)).toBe(5.5 * ROW)
  })

  it('never shows fewer than two and a half types', () => {
    expect(listMaxHeight(60, 6, ROW)).toBe(2.5 * ROW)
  })
})
