FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
# scripts/ holds the demo seed (seed-demo.ts) and the database tools (db:check, db:backup): the container needs them.
COPY scripts ./scripts
COPY docker-entrypoint.sh ./
# HOST=0.0.0.0: inside a container the API must listen on every interface (the default is loopback only when DEMO_MODE=1).
ENV NODE_ENV=production DB_PATH=/data/escape-lab.db PORT=3000 HOST=0.0.0.0
# Create and hand over /data BEFORE declaring it a volume (a VOLUME declared first keeps root ownership).
RUN mkdir -p /data && chown node:node /data && chmod +x docker-entrypoint.sh
VOLUME /data
EXPOSE 3000
# AUTH_SECRET (at least 32 characters) and CORS_ORIGIN must be provided at run time; see docs/DEPLOY.md.
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.ts"]
