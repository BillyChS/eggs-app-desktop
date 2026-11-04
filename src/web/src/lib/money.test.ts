import { describe, expect, it } from 'vitest'
import { formatColones, MAX_COLONES, parseColones } from './money'

describe('formatColones', () => {
  it.each([
    [0, '₡0'],
    [5, '₡5'],
    [999, '₡999'],
    [1500, '₡1.500'],
    [12500, '₡12.500'],
    [1250000, '₡1.250.000'],
    [-500, '-₡500'],
    [-12500, '-₡12.500'],
  ])('formats %d as %s', (value, expected) => {
    expect(formatColones(value)).toBe(expected)
  })
})

describe('parseColones', () => {
  it.each([
    ['0', 0],
    ['12500', 12500],
    ['007', 7],
    ['12.500', 12500],
    ['12,500', 12500],
    ['1.250.000', 1250000],
    ['₡12.500', 12500],
    ['₡ 12.500', 12500],
    [' 12500 ', 12500],
    ['12.500,', 12500],
  ])('reads %s', (text, value) => {
    expect(parseColones(text)).toEqual({ kind: 'ok', value })
  })

  it.each(['12500,50', '12500.50', '12.500,50', '12,5', '12.50', '0.500', '1.234,567'])('refuses céntimos in %s', (text) => {
    expect(parseColones(text)).toEqual({ kind: 'decimals' })
  })

  it.each(['abc', '12a', '-500'])('refuses %s', (text) => {
    expect(parseColones(text)).toEqual({ kind: 'invalid' })
  })

  it.each(['', '   ', '₡', '₡.'])('treats %j as empty', (text) => {
    expect(parseColones(text)).toEqual({ kind: 'empty' })
  })

  it('refuses amounts above the maximum', () => {
    expect(parseColones(MAX_COLONES.toString())).toEqual({ kind: 'ok', value: MAX_COLONES })
    expect(parseColones((MAX_COLONES + 1).toString())).toEqual({ kind: 'tooLarge' })
  })
})
