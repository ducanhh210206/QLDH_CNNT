FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY monitoring/package.json monitoring/package.json
RUN npm ci --omit=dev --workspace=backend --workspace=monitoring
COPY backend backend
COPY monitoring monitoring
COPY database database
RUN mkdir -p /app/database/backups /app/monitoring/data && chown -R node:node /app
USER node
WORKDIR /app/backend
ENV HOST=0.0.0.0 NODE_ENV=production
EXPOSE 5000
HEALTHCHECK --interval=10s --timeout=5s CMD node -e "fetch('http://127.0.0.1:5000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","src/server.js"]
