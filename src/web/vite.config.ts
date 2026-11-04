import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Must match applicationUrl in src/EggsApp.Api/Properties/launchSettings.json.
const apiDevUrl = 'http://localhost:5080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The API serves these files. Vite only empties a folder outside its root when told to.
    outDir: '../EggsApp.Api/wwwroot',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': apiDevUrl,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Date tests must fail on a machine in UTC, like CI, if the code isn't really using local time.
    env: { TZ: 'America/Costa_Rica' },
  },
})
