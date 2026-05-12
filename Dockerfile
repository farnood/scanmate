FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SCANMATE_CONFIG_DIR=/config \
    SCANMATE_DATA_DIR=/data/scanmate

RUN apt-get update && apt-get install -y --no-install-recommends \
    sane-utils \
    libsane1 \
    sane-airscan \
    hplip \
    avahi-daemon \
    dbus \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml README.md ./
COPY scanmate ./scanmate
RUN pip install --no-cache-dir .

EXPOSE 8765
CMD ["scanmate"]
