import { describe, expect, it } from 'vitest'
import { matchScore } from './search'

describe('matchScore', () => {
  it('needs every word of the search somewhere in the row', () => {
    expect(matchScore('customers', 'cust')).toBeGreaterThan(0)
    expect(matchScore('products', 'cust')).toBe(0)
    expect(matchScore('orders.customer_id', 'ord cust')).toBeGreaterThan(0)
    expect(matchScore('orders.customer_id', 'ord ship')).toBe(0)
  })

  it('searches the keywords as well', () => {
    expect(matchScore('payments.amount_cents', 'int', ['column', 'int'])).toBeGreaterThan(0)
  })

  it('ranks matches at the start of a name above matches inside it', () => {
    expect(matchScore('orders', 'ord')).toBeGreaterThan(matchScore('records', 'ord'))
    expect(matchScore('order_items', 'items')).toBeGreaterThan(matchScore('lineitems', 'items'))
  })

  it('lets an empty search show everything', () => {
    expect(matchScore('anything', '  ')).toBe(1)
  })
})
