# Stage 1: Build TypeScript (only needs tsc, not native modules)
FROM node:20-alpine AS builder

RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN apk add --no-cache python3 make g++ && \
    npm config set registry https://registry.npmmirror.com && \
    npm ci --os=linux --cpu=x64 --libc=musl

COPY src/ ./src/
RUN npx tsc

# Stage 2: Production dependencies only
FROM node:20-alpine AS deps

RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories
WORKDIR /app
COPY package*.json ./

RUN apk add --no-cache python3 make g++ && \
    npm config set registry https://registry.npmmirror.com && \
    npm ci --omit=dev --os=linux --cpu=x64 --libc=musl && \
    npm cache clean --force && \
    rm -rf /root/.npm /tmp/* && \
    rm -rf node_modules/@img/sharp-libvips-linux-x64 \
           node_modules/@img/sharp-linux-x64

# Stage 3: Final image
FROM node:20-alpine

RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories
# vips runtime for sharp + Chinese font for cover text rendering
RUN apk add --no-cache vips font-noto-cjk fontconfig && \
    rm -f /usr/share/fonts/noto/NotoSerifCJK-*.ttc && \
    fc-cache -f && \
    rm -rf /var/cache/apk/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY --from=builder /app/dist/ ./dist/
COPY src/core/css/themes/ ./dist/core/css/themes/
COPY assets/ ./assets/
COPY public/ ./public/

# Mount points
VOLUME ["/app/config", "/app/themes", "/app/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/index.js"]
