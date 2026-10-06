// Lints this package's own config modules with the shared rules they export.
import { eslintConfigPrettier, sentinelEslintBase } from './eslint'

export default [...sentinelEslintBase, eslintConfigPrettier]
