import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import fs from 'fs'

const isTest = process.env.NODE_ENV === 'test'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    // Conditional inclusion: bypass Electron bundling plugins when running Unit Tests
    ...(!isTest
      ? [
          electron([
            {
              entry: 'src/electron/main.ts',
              vite: {
                build: {
                  rollupOptions: {
                    external: ['better-sqlite3'],
                  },
                },
              },
            },
            {
              entry: 'src/electron/preload.ts',
            },
          ]),
          renderer(),
          {
            name: 'copy-migrations',
            buildStart() {
              const srcDir = path.resolve(__dirname, 'src/database/migrations')
              const destDir = path.resolve(__dirname, 'dist-electron/migrations')
              const copyDir = (src: string, dest: string) => {
                if (!fs.existsSync(src)) return
                fs.mkdirSync(dest, { recursive: true })
                const entries = fs.readdirSync(src, { withFileTypes: true })
                for (const entry of entries) {
                  const srcPath = path.join(src, entry.name)
                  const destPath = path.join(dest, entry.name)
                  if (entry.isDirectory()) {
                    copyDir(srcPath, destPath)
                  } else {
                    fs.copyFileSync(srcPath, destPath)
                  }
                }
              }
              copyDir(srcDir, destDir)
              console.log('Successfully copied SQL migrations directory recursively')
            },
          },
        ]
      : []),
  ],
  test: {
    globals: true,
    environment: 'node',
  },
})
