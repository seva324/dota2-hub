import fs from 'node:fs';
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

import { runEdgeOneApiRequest } from './dev-edgeone-api';

function loadEnvFile(filePath: string) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, '../../.env.local'));
loadEnvFile(path.resolve(__dirname, '../../.env'));

function readIncomingBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

export function createEdgeOneApiPlugin() {
  return {
    name: 'edgeone-api-dev-middleware',
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void | Promise<void>) => void } }) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '/';
        if (!url.startsWith('/api/')) {
          next();
          return;
        }

        const protocol = (req.headers['x-forwarded-proto'] as string) || 'http';
        const host = (req.headers.host as string) || '127.0.0.1:5173';
        const body = await readIncomingBody(req);
        const request = new Request(`${protocol}://${host}${url}`, {
          method: req.method || 'GET',
          headers: new Headers(Object.entries(req.headers).flatMap(([key, value]) => {
            if (Array.isArray(value)) return value.map((item) => [key, item] as [string, string]);
            return value ? [[key, String(value)] as [string, string]] : [];
          })),
          body: body && !['GET', 'HEAD'].includes((req.method || 'GET').toUpperCase()) ? body : undefined,
        });

        const response = await runEdgeOneApiRequest(request, { runtime: 'vite-dev' });
        res.statusCode = response.status;
        response.headers.forEach((value: string, key: string) => {
          res.setHeader(key, value);
        });
        res.end(await response.text());
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [createEdgeOneApiPlugin(), inspectAttr(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
