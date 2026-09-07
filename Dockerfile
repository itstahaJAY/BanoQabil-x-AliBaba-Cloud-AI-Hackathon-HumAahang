FROM node:24-bookworm-slim AS web-build
WORKDIR /build
ENV CI=1 EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY app.json tsconfig.json App.tsx index.ts ./
COPY app ./app
COPY src ./src
COPY assets ./assets
RUN npx expo export --platform web --output-dir dist

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production STT_DEPLOYMENT=public WEB_ROOT=/app/dist PORT=8787
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server/*.mjs ./
COPY --from=web-build /build/dist /app/dist
USER node
EXPOSE 8787
CMD ["node", "index.mjs"]
