FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/music-domain/package.json packages/music-domain/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci
COPY . .
RUN npm run build
RUN mkdir -p node_modules/.vite-temp node_modules/.vitest-cache && chown node:node node_modules/.vite-temp node_modules/.vitest-cache
USER node
CMD ["npm", "run", "start", "-w", "@guitar/api"]
