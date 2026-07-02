FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    MUSIC_HUB_HOST=0.0.0.0 \
    MUSIC_HUB_PORT=3000 \
    MUSIC_HUB_MCP_HOST=0.0.0.0 \
    MUSIC_HUB_MCP_PORT=3100

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY config.example.json LICENSE README.md ./

RUN mkdir -p data/sources data/downloads data/cache data/logs

EXPOSE 3000 3100

CMD ["npm", "run", "start:all"]
