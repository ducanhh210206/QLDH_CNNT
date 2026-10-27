FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
COPY monitoring/package.json monitoring/package.json
RUN npm ci --workspace=frontend
COPY frontend frontend
RUN npm run build -w frontend
FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY gateway/nginx.conf /etc/nginx/conf.d/default.conf
