FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
# HOST=0.0.0.0: inside a container the API must listen on every interface (the default is loopback only when DEMO_MODE=1).
ENV NODE_ENV=production DB_PATH=/data/escape-lab.db PORT=3000 HOST=0.0.0.0
VOLUME /data
EXPOSE 3000
# AUTH_SECRET must be provided at run time.
RUN mkdir -p /data && chown node:node /data
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.ts"]
