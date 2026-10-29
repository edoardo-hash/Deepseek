FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pil \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN python3 build.py

ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

# STUDIO_PASSWORD is required at runtime; the server refuses to expose the
# Studio without it. Mount content/, assets/img/uploads/ and .studio/ as
# volumes so edits and uploads survive a container replacement.
CMD ["node", "server.mjs"]
