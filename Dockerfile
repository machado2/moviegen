FROM node:22-slim AS base
# ffmpeg for film assembly; python3 + Pillow/img2pdf/ebooklib for comics montage & book export;
# the nickel CLI evaluates the on-disk .ncl project files back into data.
ARG NICKEL_VERSION=1.17.0
RUN apt-get update \
  && apt-get install -y ffmpeg python3 python3-pip curl ca-certificates \
  && pip3 install --no-cache-dir --break-system-packages pillow img2pdf ebooklib \
  && arch="$(dpkg --print-architecture)" \
  && case "$arch" in \
       amd64) ncl_asset=nickel-x86_64-linux ;; \
       arm64) ncl_asset=nickel-arm64-linux ;; \
       *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
     esac \
  && curl -fsSL -o /usr/local/bin/nickel \
       "https://github.com/nickel-lang/nickel/releases/download/${NICKEL_VERSION}/${ncl_asset}" \
  && chmod +x /usr/local/bin/nickel \
  && nickel --version \
  && rm -rf /var/lib/apt/lists/*

FROM base AS builder
WORKDIR /app
# pnpm via corepack (version pinned by the root package.json "packageManager" field).
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# --frozen-lockfile: install exactly what the lockfile pins, never resolve anew.
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM base AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder /app/packages/types/dist ./packages/types/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "dist/server.js"]
