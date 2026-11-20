import { afterEach, describe, expect, it } from 'vitest'
import {
  getConfigExports,
  registerConfigExport,
  resetConfigExportsForTests,
  type ConfigExport,
} from './configExports'

function configExport(filename: string): ConfigExport {
  return { filename, read: async () => ({ filename }) }
}

describe('configExports', () => {
  afterEach(() => {
    resetConfigExportsForTests()
  })

  it('starts empty, so Export All writes only Sentinel’s own files', () => {
    expect(getConfigExports()).toEqual([])
  })

  it('lists registered files in registration order', () => {
    const first = configExport('first.json')
    const second = configExport('second.json')
    registerConfigExport(first)
    registerConfigExport(second)

    expect(getConfigExports()).toEqual([first, second])
  })

  it('refuses a second file with the same name', () => {
    registerConfigExport(configExport('sdr-manager-local-config.json'))

    expect(() => registerConfigExport(configExport('sdr-manager-local-config.json'))).toThrow(
      'Config export "sdr-manager-local-config.json" is already registered',
    )
    expect(getConfigExports()).toHaveLength(1)
  })

  it('hands out a copy, so a caller cannot change the registry', () => {
    registerConfigExport(configExport('first.json'))
    const listed = getConfigExports() as ConfigExport[]
    listed.push(configExport('sneaked-in.json'))

    expect(getConfigExports().map((entry) => entry.filename)).toEqual(['first.json'])
  })

  it('forgets every file on reset', () => {
    registerConfigExport(configExport('first.json'))
    resetConfigExportsForTests()

    expect(getConfigExports()).toEqual([])
    expect(() => registerConfigExport(configExport('first.json'))).not.toThrow()
  })
})
