import { describe, expect, it } from 'vitest'
import { decodeShare, encodeShare, shareUrl } from './encode'

const diagram = {
  name: 'Shop & Co',
  source: "Table users {\n  id int [pk]\n  name varchar [note: 'ünïcödé + plus']\n}\n",
}

describe('share links', () => {
  it('round-trips a diagram through a URL fragment', () => {
    expect(decodeShare(`#${encodeShare(diagram)}`)).toEqual(diagram)
  })

  it('produces a fragment that is safe inside a URL', () => {
    expect(encodeShare(diagram)).toMatch(/^d=[A-Za-z0-9+\-$]+$/)
  })

  it('survives being read through the URL API', () => {
    const url = new URL(shareUrl(diagram, 'https://example.com/app?x=1#old'))
    expect(url.search).toBe('?x=1')
    expect(decodeShare(url.hash)).toEqual(diagram)
  })

  it('falls back to a default name', () => {
    const decoded = decodeShare(`#${encodeShare({ name: '  ', source: 'Table a { id int }' })}`)
    expect(decoded?.name).toBe('Shared diagram')
  })

  it.each(['', '#', '#d=', '#d=not-valid-data', '#other=1'])('ignores %j', (hash) => {
    expect(decodeShare(hash)).toBeNull()
  })

  it('rejects payloads without a source', () => {
    // A valid lz-string payload whose JSON has the wrong shape.
    const packed = encodeShare({ name: 'x', source: 'y' })
    expect(decodeShare(`#${packed}`)).not.toBeNull()
    expect(decodeShare('#d=NoXSA')).toBeNull()
  })
})
