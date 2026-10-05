import { sentinelSectionViteConfig } from '@sentinel/web-config/vite'

// Builds this section as a Module Federation remote into frontend/spa-dist/remotes/sdr/.
export default sentinelSectionViteConfig('sdr', import.meta.url)
