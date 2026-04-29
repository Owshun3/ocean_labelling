FROM node:20-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY src/ ./src/
COPY package.json .
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "src/index.js"]
