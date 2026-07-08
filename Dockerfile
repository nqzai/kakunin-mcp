# Kakunin MCP server — stdio. Builds and runs @kakunin/mcp.
# Tools are listed without credentials; KAKUNIN_API_KEY / KAKUNIN_AGENT_ID are
# only required when a tool is actually invoked.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
ENTRYPOINT ["node", "dist/index.js"]
