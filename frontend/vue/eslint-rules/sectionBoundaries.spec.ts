import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'
import rule, { resolveSpecifier, toSrcRelative } from './sectionBoundaries'

// A fake project root: the rule only looks at the path segment after `/src/`.
const SRC = path.join(path.sep, 'project', 'frontend', 'vue', 'src')
const file = (srcRelative: string) => path.join(SRC, ...srcRelative.split('/'))

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 2022, sourceType: 'module' },
})

const crossSection = (importer: string, target: string, specifier: string) => ({
  messageId: 'crossSection' as const,
  data: { importer, target, specifier },
})

describe('sentinel/section-boundaries', () => {
  ruleTester.run('section-boundaries', rule, {
    valid: [
      // A section importing itself, core, the shell or a package.
      {
        filename: file('components/land/LandView.ts'),
        code: "import x from './LandFilter.vue'",
      },
      {
        filename: file('components/land/LandView.ts'),
        code: "import { useLandStore } from '@/stores/land'",
      },
      {
        filename: file('components/land/LandView.ts'),
        code: "import { useRadio } from '@sentinel/shell-api/shell/useRadio'",
      },
      {
        filename: file('components/land/LandView.ts'),
        code: "import AprsSymbol from '@/components/shared/AprsSymbol.vue'",
      },
      { filename: file('components/land/LandView.ts'), code: "import { ref } from 'vue'" },
      // Core importing core.
      {
        filename: file('components/shared/AppFooter.ts'),
        code: "import { getFooterItems } from '@sentinel/shell-api/shell/footerRegistry'",
      },
      // The composition root may import every section.
      { filename: file('shell/sections.ts'), code: "import '@/components/air/section'" },
      // Tests and test helpers compose sections freely.
      {
        filename: file('components/shared/MapSidebar.spec.ts'),
        code: "import { airSidebarFilter } from '@/components/air/airSidebarFilter'",
      },
      { filename: file('test/fakeRadio.ts'), code: "import { useSdrStore } from '@/stores/sdr'" },
      // Files outside src/ (config, scripts) are not checked.
      {
        filename: path.join(path.sep, 'project', 'frontend', 'vue', 'vite.config.ts'),
        code: "import '@/stores/sdr'",
      },
      // Non-literal dynamic imports and source-less exports are ignored.
      {
        filename: file('components/land/LandView.ts'),
        code: 'const name = "x"; void import(name)',
      },
      { filename: file('components/land/LandView.ts'), code: 'const value = 1; export { value }' },
      // A section-owned file in a flat folder belongs to its section.
      {
        filename: file('stores/sdr.ts'),
        code: "import { listRadios } from '@/services/sdrRadiosApi'",
      },
    ],
    invalid: [
      {
        filename: file('components/land/LandView.ts'),
        code: "import { useSdrStore } from '@/stores/sdr'",
        errors: [crossSection('land', 'sdr', '@/stores/sdr')],
      },
      {
        // A relative path that climbs into another section.
        filename: file('components/land/LandFilter.ts'),
        code: "import SdrPanel from '../sdr/SdrPanel.vue'",
        errors: [crossSection('land', 'sdr', '../sdr/SdrPanel.vue')],
      },
      {
        filename: file('components/sea/seaThing.ts'),
        code: "export { foo } from '@/components/air/airThing'",
        errors: [crossSection('sea', 'air', '@/components/air/airThing')],
      },
      {
        filename: file('components/sea/seaThing.ts'),
        code: "export * from '@/stores/space'",
        errors: [crossSection('sea', 'space', '@/stores/space')],
      },
      {
        filename: file('components/air/airThing.ts'),
        code: "const view = () => import('@/components/sea/SeaView.vue')",
        errors: [crossSection('air', 'sea', '@/components/sea/SeaView.vue')],
      },
      {
        // Core may not reach into a section (only the composition root may).
        filename: file('main.ts'),
        code: "import { useAirStore } from './stores/air'",
        errors: [crossSection('core', 'air', './stores/air')],
      },
      {
        filename: file('components/shared/AppFooter.ts'),
        code: "import { useSdrStore } from '@/stores/sdr'",
        errors: [crossSection('core', 'sdr', '@/stores/sdr')],
      },
      {
        // A section is not exempt for being imported by the composition root's name.
        filename: file('components/air/sections.ts'),
        code: "import '@/components/land/section'",
        errors: [crossSection('air', 'land', '@/components/land/section')],
      },
    ],
  })
})

describe('toSrcRelative', () => {
  it('gives the src-relative path without extension or trailing index', () => {
    expect(toSrcRelative(file('components/air/AirView.vue'))).toBe('components/air/AirView')
    expect(toSrcRelative(file('stores/sdr.ts'))).toBe('stores/sdr')
    expect(toSrcRelative(file('shell/index.ts'))).toBe('shell')
  })

  it('is null outside src/', () => {
    expect(toSrcRelative(path.join(path.sep, 'project', 'vite.config.ts'))).toBeNull()
  })
})

describe('resolveSpecifier', () => {
  it('resolves the @/ alias and relative paths against the importer', () => {
    expect(resolveSpecifier('components/land/LandView', '@/stores/sdr.ts')).toBe('stores/sdr')
    expect(resolveSpecifier('components/land/LandView', './LandFilter.vue')).toBe(
      'components/land/LandFilter',
    )
    expect(resolveSpecifier('components/land/LandView', '../shared/index')).toBe(
      'components/shared',
    )
    expect(resolveSpecifier('main', './shell/sections')).toBe('shell/sections')
  })

  it('is null for a package import', () => {
    expect(resolveSpecifier('main', 'vue')).toBeNull()
    expect(resolveSpecifier('main', 'maplibre-gl/dist/maplibre-gl.css')).toBeNull()
  })
})
