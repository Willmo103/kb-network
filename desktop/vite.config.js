import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist-frontend',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
  server: {
    port: 3000
  }
})
