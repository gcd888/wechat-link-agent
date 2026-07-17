import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'electron-vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@renderer': resolve(__dirname, 'renderer'),
    },
  },
  // electron-vite handles both main and renderer builds
})
