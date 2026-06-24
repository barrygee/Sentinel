import { describe, it, expect } from 'vitest'
import { useDisclosure } from './useDisclosure'

describe('useDisclosure', () => {
  it('starts closed by default', () => {
    const { open } = useDisclosure()
    expect(open.value).toBe(false)
  })

  it('honours an initially-open argument', () => {
    const { open } = useDisclosure(true)
    expect(open.value).toBe(true)
  })

  it('toggle flips the open state both ways', () => {
    const { open, toggle } = useDisclosure()
    toggle()
    expect(open.value).toBe(true)
    toggle()
    expect(open.value).toBe(false)
  })
})
