# Fluxion server + dashboard + overlay in one image. The companion app is not part of it.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# The companion's manifest is only here so npm ci accepts the lockfile; its dependencies aren't installed.
COPY apps/companion/package.json apps/companion/
RUN npm ci -w packages/shared -w apps/server -w apps/web
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web
RUN npm run build

# Piper (MIT, https://github.com/rhasspy/piper) for server-side text-to-speech, plus voices whose licenses
# allow commercial use (see THIRD_PARTY_NOTICES.md). PIPER_VOICES picks which; each adds 60–80 MB.
# Build with --build-arg WITH_PIPER=false to leave Piper out; TTS then falls back to eSpeak.
FROM debian:bookworm-slim AS piper
ARG TARGETARCH
ARG WITH_PIPER=true
ARG PIPER_RELEASE=2023.11.14-2
ARG VOICES_URL=https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en
ARG PIPER_VOICES="en_GB/alba/medium/en_GB-alba-medium en_US/libritts_r/medium/en_US-libritts_r-medium en_GB/vctk/medium/en_GB-vctk-medium en_US/kristin/medium/en_US-kristin-medium en_GB/northern_english_male/medium/en_GB-northern_english_male-medium"
RUN mkdir -p /opt/piper /opt/piper-voices && if [ "$WITH_PIPER" = "true" ]; then \
      apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && \
      case "$TARGETARCH" in arm64) arch=aarch64 ;; *) arch=x86_64 ;; esac && \
      curl -fsSL "https://github.com/rhasspy/piper/releases/download/$PIPER_RELEASE/piper_linux_$arch.tar.gz" | tar xz -C /opt && \
      cd /opt/piper-voices && \
      for v in $PIPER_VOICES; do \
        curl -fsSLO "$VOICES_URL/$v.onnx" && curl -fsSLO "$VOICES_URL/$v.onnx.json"; \
      done; \
    fi

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/web/package.json apps/web/
COPY --from=build /app/apps/companion/package.json apps/companion/
RUN npm ci --omit=dev -w packages/shared -w apps/server

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=piper /opt/piper /opt/piper
COPY --from=piper /opt/piper-voices /opt/piper-voices
# With WITH_PIPER=false the voices folder is empty, so the server falls back to eSpeak.
ENV PIPER_BIN=/opt/piper/piper PIPER_VOICES_DIR=/opt/piper-voices
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/drizzle apps/server/drizzle
COPY --from=build /app/apps/web/dist apps/web/dist
USER node
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
