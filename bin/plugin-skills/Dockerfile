FROM node:22-trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates poppler-utils tesseract-ocr tesseract-ocr-eng tesseract-ocr-ita fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY *.mjs ./
COPY skills ./skills
ENTRYPOINT ["node", "/app/service.mjs"]
