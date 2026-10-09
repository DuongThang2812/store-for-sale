FROM node:24-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/shared ./shared
COPY backend/supabase/functions/_shared ./supabase/functions/_shared
COPY backend/services/auth-service ./services/auth-service
USER node
ENV HOST=0.0.0.0 PORT=8081
EXPOSE 8081
CMD ["node", "services/auth-service/server.js"]
