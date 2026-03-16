import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Electron plugins are only applied when building for Electron (--mode electron)
// Capacitor / web builds use plain Vite + React — no Node.js polyfills injected
export default defineConfig(({ mode }) => {
  const isElectron = mode === 'electron'

  const plugins: any[] = [react()]

  if (isElectron) {
    // Dynamic require to avoid errors when electron packages are not present
    const electron = require('vite-plugin-electron').default
    const renderer = require('vite-plugin-electron-renderer').default

    plugins.push(
      electron([
        {
          entry: 'electron/main.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                external: ['electron', 'better-sqlite3', 'electron-store'],
              },
            },
          },
        },
        {
          entry: 'electron/preload.ts',
          onstart(args: any) {
            args.reload()
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                external: ['electron'],
              },
            },
          },
        },
      ]),
      renderer()
    )
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
