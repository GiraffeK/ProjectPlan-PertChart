import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

function mppParserPlugin(): Plugin {
  const handleRequest = async (req: any, res: any) => {
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        const tempPath = path.join(os.tmpdir(), `temp_${Date.now()}_project.mpp`);
        try {
          await fs.promises.writeFile(tempPath, buffer);
          const pyScript = path.resolve('scripts/parse_mpp.py');
          const pythonProcess = spawn('python', [pyScript, tempPath]);

          let stdout = '';
          let stderr = '';

          pythonProcess.stdout.on('data', data => {
            stdout += data.toString();
          });

          pythonProcess.stderr.on('data', data => {
            stderr += data.toString();
          });

          pythonProcess.on('close', code => {
            try {
              if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
              }
            } catch {}

            if (code === 0 && stdout.trim()) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 200;
              res.end(stdout);
            } else {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: stderr || 'Failed to parse MPP file' }));
            }
          });
        } catch (err: any) {
          try {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          } catch {}
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else {
      res.statusCode = 405;
      res.end('Method Not Allowed');
    }
  };

  return {
    name: 'mpp-parser-api',
    configureServer(server) {
      server.middlewares.use('/api/parse-mpp', handleRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/parse-mpp', handleRequest);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    mppParserPlugin(),
  ],
});

