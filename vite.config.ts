import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Electron plugins are only applied when building for Electron (--mode electron)
// Capacitor / web builds use plain Vite + React with legacy browser support
export default defineConfig(({ mode }) => {
  const isElectron = mode === 'electron'

  const plugins: any[] = [
    react(),
    // Legacy plugin: transpiles to ES5 + adds nomodule fallback for Android 5.x WebView
    // Android 5.1.1 WebView = Chrome 37 era — does NOT support ES modules or ES2020 syntax
    legacy({
      targets: ['android >= 5', 'chrome >= 37'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ]

  if (isElectron) {
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
    build: {
      // Target ES2015 as minimum — Android 5.1.1 WebView supports this with polyfills
      target: 'es2015',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
