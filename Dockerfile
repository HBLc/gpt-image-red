FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY server ./server
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY src ./src
COPY --from=build /app/dist ./dist

EXPOSE 8787
CMD ["npm", "run", "start"]
