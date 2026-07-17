// 确保 Electron 以应用模式运行，而非 Node.js 模式
// ELECTRON_RUN_AS_NODE 环境变量可能导致 Electron 退化为纯 Node.js
delete process.env.ELECTRON_RUN_AS_NODE

import { resolve } from 'path'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/** 构建完成后将 SQL 文件复制到 dist-electron/ */
function copySqlPlugin(): Plugin {
  return {
    name: 'copy-sql-files',
    closeBundle() {
      const outDir = resolve(__dirname, 'dist-electron')
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
      for (const file of ['schema.sql', 'seed.sql']) {
        const src = resolve(__dirname, 'src/database', file)
        const dest = resolve(outDir, file)
        copyFileSync(src, dest)
        console.log(`  ✓ copied ${file} → dist-electron/`)
      }
    },
  }
}

export default defineConfig({
  main: {
    build: {
      outDir: 'dist-electron',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
    plugins: [externalizeDepsPlugin(), copySqlPlugin()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist-electron',
      emptyOutDir: false,
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: resolve(__dirname, 'renderer'),
    build: {
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'renderer/index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@renderer': resolve(__dirname, 'renderer'),
      },
    },
    plugins: [react()],
  },
})
