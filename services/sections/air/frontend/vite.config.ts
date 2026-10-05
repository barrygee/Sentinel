import { sentinelSectionViteConfig } from '@sentinel/web-config/vite'

// Builds this section as a Module Federation remote into frontend/spa-dist/remotes/air/.
export default sentinelSectionViteConfig('air', import.meta.url)
