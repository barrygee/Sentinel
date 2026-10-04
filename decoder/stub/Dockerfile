# Stub decoder — a stand-in decoder container that exercises the radio hub's
# decoder contract (register → poll config → read PCM → ingest) without decoding
# anything, so CI and local development can test it without mbelib or a real
# signal. Standard-library Python only. See decoder/stub/README.md.
#
# OPT-IN: only built/started with `docker compose --profile decoder-stub`.

FROM python:3.12-slim

RUN useradd --create-home --uid 10001 stub
COPY entrypoint.py /app/entrypoint.py

USER stub
WORKDIR /app
CMD ["python", "-u", "/app/entrypoint.py"]
