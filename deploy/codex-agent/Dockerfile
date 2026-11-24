FROM node:22-trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends bubblewrap ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && bwrap --version

ARG CODEX_VERSION=0.171.0
LABEL org.opencontainers.image.version=${CODEX_VERSION}
RUN npm install --global --no-audit --no-fund --cache /tmp/codex-npm "@openai/codex@${CODEX_VERSION}" \
    && rm -rf /tmp/codex-npm \
    && mkdir -p /tmp/aop-image-check/.codex \
    && test "$(HOME=/tmp/aop-image-check CODEX_HOME=/tmp/aop-image-check/.codex codex --version)" = "codex-cli ${CODEX_VERSION}" \
    && rm -rf /tmp/aop-image-check \
    && test ! -e /root/.codex \
    && rg_bin="$(find "$(npm root -g)/@openai/codex" -type f -path '*/codex-path/rg')" \
    && test -x "$rg_bin" \
    && ln -s "$rg_bin" /usr/local/bin/rg \
    && rg --pcre2-version

COPY start.sh /usr/local/bin/aop-start
WORKDIR /workspace
ENTRYPOINT ["/bin/sh", "/usr/local/bin/aop-start"]
