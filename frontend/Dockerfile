FROM node:20-slim AS build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM node:20-slim
WORKDIR /app/frontend
ENV NODE_ENV=production
COPY --from=build /app/frontend/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/frontend/.next ./.next
COPY --from=build /app/frontend/next.config.mjs ./next.config.mjs
EXPOSE 3000
CMD ["npm", "start"]
