# syntax=docker/dockerfile:1
# Multi-stage build: compile everything, then ship only the server runtime + built web app.

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json vitest.aliases.ts ./
COPY packages/shared-config/package.json packages/shared-config/
COPY packages/rules/package.json packages/rules/
COPY packages/protocol/package.json packages/protocol/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
RUN pnpm build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0
WORKDIR /app
RUN corepack enable
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/shared-config/package.json packages/shared-config/
COPY --from=build /app/packages/shared-config/dist packages/shared-config/dist
COPY --from=build /app/packages/rules/package.json packages/rules/
COPY --from=build /app/packages/rules/dist packages/rules/dist
COPY --from=build /app/packages/protocol/package.json packages/protocol/
COPY --from=build /app/packages/protocol/dist packages/protocol/dist
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/package.json apps/web/
COPY --from=build /app/apps/web/dist apps/web/dist
RUN pnpm install --prod --frozen-lockfile --filter "@lineup/server..." \
    && rm -rf /root/.local/share/pnpm /root/.cache
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3001/healthz >/dev/null || exit 1
CMD ["node", "apps/server/dist/index.js"]
