FROM node:24-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/shared ./shared
COPY backend/supabase/functions/_shared ./supabase/functions/_shared
COPY backend/gateway ./gateway
USER node
ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["node", "gateway/server.js"]
