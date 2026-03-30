FROM node:22-bookworm AS builder

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

WORKDIR /app

# Copy manifests first to maximize layer cache reuse.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/core/package.json packages/core/
COPY packages/sdk/package.json packages/sdk/
COPY packages/ui/package.json packages/ui/
COPY packages/miniapp-file-explorer/package.json packages/miniapp-file-explorer/
COPY packages/miniapp-note/package.json packages/miniapp-note/
COPY packages/miniapp-player/package.json packages/miniapp-player/
COPY packages/miniapp-preference/package.json packages/miniapp-preference/
COPY packages/miniapp-preview/package.json packages/miniapp-preview/
COPY packages/miniapp-terminal/package.json packages/miniapp-terminal/
COPY packages/miniapp-text-edit/package.json packages/miniapp-text-edit/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build


FROM node:22-bookworm-slim AS production

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

ENV NODE_ENV=production \
    XDG_CONFIG_HOME=/home/node/.config \
    XDG_DATA_HOME=/home/node/.local/share \
    XDG_STATE_HOME=/home/node/.local/state \
    XDG_CACHE_HOME=/home/node/.cache

WORKDIR /app

RUN mkdir -p /home/node/.config/desktalk \
    /home/node/.local/share/desktalk \
    /home/node/.local/state/desktalk \
    /home/node/.cache/desktalk \
    && chown -R node:node /home/node

COPY --from=builder --chown=node:node /app /app

VOLUME ["/home/node/.config/desktalk", "/home/node/.local/share/desktalk"]

EXPOSE 3000

USER node
WORKDIR /app/packages/core

CMD ["node", "dist/cli/index.js", "start", "--host", "0.0.0.0", "--port", "3000"]
