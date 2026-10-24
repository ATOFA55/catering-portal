FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
# apply migrations, load demo data on first start (skipped if data exists), then start the API
CMD ["sh", "-c", "npx drizzle-kit migrate && npx ts-node --transpile-only src/db/seed.ts && node dist/main.js"]
