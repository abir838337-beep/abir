# docker build -t aliya . --build-arg NODE_VERSION=26   (default: 22)
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm-slim

WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates unzip \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8080)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "index.js"]
