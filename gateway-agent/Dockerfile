# Mango IoT Gateway Agent
# Runs on the gateway (or a host on its LAN). Makes an outbound TLS connection
# to the Mango backend — no inbound ports required.
FROM node:20-slim

# node-pty needs a C/C++ toolchain to build its native addon.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm install --no-save typescript && npx tsc -p tsconfig.json && npm uninstall typescript

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
