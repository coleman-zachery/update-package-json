import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/update-package-json/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (
            id.includes('/react/')
            || id.includes('/react-dom/')
            || id.includes('/scheduler/')
          ) {
            return 'react-vendor'
          }

          if (id.includes('/@uiw/react-codemirror/')) {
            return 'editor-ui'
          }

          if (
            id.includes('/@codemirror/')
            || id.includes('/codemirror/')
            || id.includes('/@lezer/')
          ) {
            return 'editor-core'
          }

          if (id.includes('/semver/')) {
            return 'semver-vendor'
          }

          return undefined
        },
      },
    },
  },
})
