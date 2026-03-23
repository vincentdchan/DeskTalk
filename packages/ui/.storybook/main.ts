import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { StorybookConfig } from '@storybook/web-components-vite';
import { mergeConfig } from 'vite';

const configDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(configDir, '../../..');

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.ts'],
  addons: ['@storybook/addon-a11y'],
  framework: {
    name: '@storybook/web-components-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  async viteFinal(baseConfig) {
    return mergeConfig(baseConfig, {
      server: {
        fs: {
          allow: [workspaceRoot],
        },
      },
    });
  },
};

export default config;
