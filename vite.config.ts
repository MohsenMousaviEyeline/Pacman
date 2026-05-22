import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin, Connect } from 'vite'

// Read version once at startup
const { version } = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
) as { version: string }

const startTime = Date.now()

function healthPlugin(): Plugin {
  const handler: Connect.SimpleHandleFunction = (_req, res) => {
    const body = JSON.stringify({
      status: 'ok',
      version,
      uptime_ms: Date.now() - startTime,
      uptime_s: Math.floor((Date.now() - startTime) / 1000),
    })
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    })
    res.end(body)
  }

  return {
    name: 'health-endpoint',
    configureServer(server) {
      server.middlewares.use('/health', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/health', handler)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), healthPlugin()],
})
