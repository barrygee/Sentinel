import {
  eslintConfigPrettier,
  sentinelEslintBase,
  sharedPackageImports,
} from '@sentinel/web-config/eslint'

export default [...sentinelEslintBase, ...sharedPackageImports, eslintConfigPrettier]
