FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json next.config.js tailwind.config.ts postcss.config.js ./
COPY styles ./styles
COPY lib ./lib
COPY hooks ./hooks
COPY types ./types
COPY components ./components
COPY app ./app
COPY public ./public

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server.js"]
