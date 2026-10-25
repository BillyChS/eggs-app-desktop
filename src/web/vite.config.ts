import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Must match applicationUrl in src/EggsApp.Api/Properties/launchSettings.json.
const apiDevUrl = 'http://localhost:5080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiDevUrl,
    },
  },
})
