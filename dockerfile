FROM mwader/static-ffmpeg:latest AS ffmpeg

FROM oven/bun:latest

COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe

WORKDIR /app

COPY . .
RUN bun i

ENV NODE_ENV=production

CMD ["bun", "./src/app.ts"]
