FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY tsconfig.json config.example.json ./
COPY src ./src
COPY assets ./assets

ENV CONFIG_PATH=/app/config.json
EXPOSE 8080

CMD ["npx", "tsx", "src/main/index.ts"]
