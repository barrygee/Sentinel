import {
  eslintConfigPrettier,
  noSectionImports,
  sentinelEslintBase,
} from '@sentinel/web-config/eslint'

export default [...sentinelEslintBase, noSectionImports, eslintConfigPrettier]
