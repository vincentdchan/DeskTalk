/**
 * Audio worklet plugin.
 *
 * In dev: serves `audio-worklet-processor.js` at `/pcm-capture-processor.js`
 * via middleware so the AudioWorklet can load it.
 *
 * In build: emits the file as a static asset into the output directory.
 */

import type { Plugin } from 'vite';
import { readFileSync } from 'node:fs';

export function audioWorkletPlugin(options: { workletPath: string }): Plugin {
  return {
    name: 'desktalk-audio-worklet',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/pcm-capture-processor.js') {
          res.setHeader('Content-Type', 'application/javascript');
          res.end(readFileSync(options.workletPath, 'utf-8'));
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'pcm-capture-processor.js',
        source: readFileSync(options.workletPath, 'utf-8'),
      });
    },
  };
}
