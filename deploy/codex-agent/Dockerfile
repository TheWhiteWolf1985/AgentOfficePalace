FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global @openai/codex@0.154.0 \
    && codex --version && npm cache clean --force
COPY start.sh /usr/local/bin/aop-start
RUN chmod 0755 /usr/local/bin/aop-start
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/aop-start"]
