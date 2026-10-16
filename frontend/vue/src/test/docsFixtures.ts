import { buildDocsLibrary } from '@/docs/docsNavigation'

/**
 * A small, fixed documentation set for the docs specs: three groups with
 * pages, one nested sub-list, one empty group (hidden) and synonyms. It keeps
 * the specs independent of whatever the real `docs/` happens to say.
 */
export const FIXTURE_DOCS_MARKDOWN: Record<string, string> = {
  'docs/index.md':
    '# Welcome to Sentinel\n\nStart here.\n\n## First steps\n\nInstall and run the radio.\n',
  'docs/sections.md':
    '# What each section does\n\nAir tracks aircraft.\n\n## Air\n\nADS-B planes on a map.\n\n## Sea\n\nShips from AIS.\n',
  'docs/operations.md':
    '# Check logs\n\nRead the logs.\n\n## Health checks\n\nCall /health.\n\n### Backups\n\nCopy the volume.\n',
  'docs/adr/0001-first.md': '# First decision\n\nWe chose containers.\n',
  'docs/adr/0002-second.md': '# Second decision\n\nWe chose NATS.\n',
  'CONTRIBUTING.md': '# Contributing\n\nOpen a pull request.\n',
}

export const FIXTURE_DOCS_MANIFEST = {
  groups: [
    {
      key: 'get-started',
      title: 'Get started',
      pages: [{ path: 'index', title: 'Welcome to Sentinel' }],
    },
    { key: 'air', title: 'Things you can do', pages: [] },
    {
      key: 'sdr',
      title: 'Use Sentinel',
      pages: [
        { path: 'sections', title: 'What each section does' },
        { path: 'operations', title: 'Check logs' },
      ],
    },
    {
      key: 'develop',
      title: 'Develop',
      pages: [
        { path: 'contributing', title: 'Contributing', file: 'CONTRIBUTING.md' },
        {
          title: 'Design decisions',
          pages: [
            { path: 'adr/0001-first', title: '0001 First' },
            { path: 'adr/0002-second', title: '0002 Second' },
          ],
        },
      ],
    },
  ],
  synonyms: { plane: ['Air', 'aircraft', 'ADS-B'], ship: ['Sea', 'vessel'] },
}

export function buildFixtureDocsLibrary() {
  return buildDocsLibrary(FIXTURE_DOCS_MANIFEST, FIXTURE_DOCS_MARKDOWN)
}
