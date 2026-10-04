import path from 'node:path'
import type { Rule } from 'eslint'
import { COMPOSITION_ROOTS, ownerOf } from './sectionOwnership'

/**
 * `sentinel/section-boundaries` — no section imports another section, and core
 * imports no section (docs/plans/section-containers.md, P2 exit criterion).
 * Cross-section needs go through the shell's registries and capabilities
 * (`src/shell/`), which is what lets a section later ship as its own remote.
 *
 * Checks static imports, re-exports and dynamic `import()`, for `@/` and
 * relative specifiers; package imports are ignored. Test files are not checked:
 * a spec may compose several sections the way the app does.
 */

const SOURCE_EXTENSION = /\.(ts|tsx|js|mjs|vue)$/

/** `src/`-relative path without extension (and without a trailing `/index`), or null outside `src/`. */
export function toSrcRelative(absolutePath: string): string | null {
  const marker = `${path.sep}src${path.sep}`
  const index = absolutePath.lastIndexOf(marker)
  if (index === -1) return null
  return absolutePath
    .slice(index + marker.length)
    .split(path.sep)
    .join('/')
    .replace(SOURCE_EXTENSION, '')
    .replace(/\/index$/, '')
}

/** Where an import specifier points, `src/`-relative, or null for a package import. */
export function resolveSpecifier(importerSrcRelative: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) {
    return specifier
      .slice(2)
      .replace(SOURCE_EXTENSION, '')
      .replace(/\/index$/, '')
  }
  if (!specifier.startsWith('.')) return null
  return path.posix
    .join(path.posix.dirname(importerSrcRelative), specifier)
    .replace(SOURCE_EXTENSION, '')
    .replace(/\/index$/, '')
}

/** Spec and test-helper files compose sections freely. */
function isTestFile(srcRelative: string): boolean {
  return /\.(spec|test)$/.test(srcRelative) || srcRelative.startsWith('test/')
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow imports across section boundaries (and from core into a section)',
    },
    schema: [],
    messages: {
      crossSection:
        "{{importer}} code must not import {{target}} code ('{{specifier}}'). Use a shell registry or capability (src/shell/) instead.",
    },
  },
  create(context) {
    const importer = toSrcRelative(context.filename)
    if (importer === null || isTestFile(importer)) return {}
    const importerOwner = ownerOf(importer)
    const isCompositionRoot = COMPOSITION_ROOTS.includes(importer)

    function check(node: Rule.Node, source: unknown): void {
      if (typeof source !== 'string') return
      const target = resolveSpecifier(importer!, source)
      if (target === null) return
      const targetOwner = ownerOf(target)
      if (targetOwner === 'core' || targetOwner === importerOwner) return
      // The composition root (core) registers every section.
      if (isCompositionRoot) return
      context.report({
        node,
        messageId: 'crossSection',
        data: { importer: importerOwner, target: targetOwner, specifier: source },
      })
    }

    return {
      ImportDeclaration: (node) => check(node, node.source.value),
      ExportNamedDeclaration: (node) => check(node, node.source?.value),
      ExportAllDeclaration: (node) => check(node, node.source.value),
      ImportExpression: (node) =>
        check(node, node.source.type === 'Literal' ? node.source.value : undefined),
    }
  },
}

export default rule
