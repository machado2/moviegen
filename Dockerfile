FROM node:22-slim AS base
# ffmpeg for film assembly; python3 + Pillow/img2pdf/ebooklib for comics montage & book export.
RUN apt-get update \
  && apt-get install -y ffmpeg python3 python3-pip \
  && pip3 install --no-cache-dir --break-system-packages pillow img2pdf ebooklib \
  && rm -rf /var/lib/apt/lists/*

FROM base AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/types/package.json packages/types/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY . .
RUN npm run build

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
