FROM node:24-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/shared ./shared
COPY backend/supabase/functions/_shared ./supabase/functions/_shared
COPY backend/services/catalog-service ./services/catalog-service
USER node
ENV HOST=0.0.0.0 PORT=8082
EXPOSE 8082
CMD ["node", "services/catalog-service/server.js"]
