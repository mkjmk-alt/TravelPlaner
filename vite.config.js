import { createHash } from 'node:crypto'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function shellManifestPlugin() {
  return {
    name: 'tripplot-shell-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter(fileName => fileName !== 'sw.js' && fileName !== 'shell-assets.json')
        .map(fileName => `/${fileName}`)
        .sort()
      const cacheFingerprint = createHash('sha256')
        .update(assets.join('\n'))
        .digest('hex')
        .slice(0, 12)

      this.emitFile({
        type: 'asset',
        fileName: 'shell-assets.json',
        source: JSON.stringify({
          cacheName: `travelplaner-shell-${cacheFingerprint}`,
          assets,
        }, null, 2),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), shellManifestPlugin()],
})
