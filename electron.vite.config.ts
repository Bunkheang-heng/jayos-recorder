import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
        external: ['ffmpeg-static']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          toolbar: resolve(__dirname, 'src/preload/toolbar.ts'),
          'region-select': resolve(__dirname, 'src/preload/region-select.ts')
        }
      }
    }
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          toolbar: resolve(__dirname, 'src/renderer/toolbar/index.html'),
          pip: resolve(__dirname, 'src/renderer/pip/index.html'),
          regionSelect: resolve(__dirname, 'src/renderer/region-select/index.html')
        }
      }
    }
  }
})
