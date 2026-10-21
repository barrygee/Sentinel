# Multi-architecture image builds — `docker buildx bake` (section-containers
# plan P7.5b). Compose stays the everyday build (`docker compose up --build`);
# this file is for building the same images for other machines, e.g. an arm64
# radio host (docs/radio-host.md) from an amd64 workstation, or the reverse.
#
#   docker buildx bake                       # backend image, amd64 + arm64
#   docker buildx bake decoders              # decoder images — LOCAL ONLY
#   docker buildx bake --print               # show the resolved build plan
#   IMAGE_REPOSITORY=registry.lan:5000/sentinel docker buildx bake --push
#
# A build for two platforms can't be loaded into the classic local image store,
# so either push it (--push), or build one platform and load it:
#   docker buildx bake --set '*.platform=linux/arm64' --load
#
# The backend image is the one Sentinel ships: it runs core, every section
# service and the radio hub. The decoder images are deliberately a separate,
# opt-in group and must never be pushed to a public registry — the voice
# decoder compiles mbelib (patent-encumbered AMBE/IMBE vocoders, "educational
# purposes only"; see decoder/README.md), and the rest follow the same
# build-it-where-it-runs rule so the group stays one thing.

# Where pushed images go and what they are tagged. A private registry on the
# LAN is the expected target for a multi-host deployment.
variable "IMAGE_REPOSITORY" {
  default = "sentinel"
}

variable "IMAGE_TAG" {
  default = "latest"
}

# Both architectures Sentinel runs on: x86 servers/desktops and Raspberry Pi-
# class arm64 boards (the usual radio host).
variable "IMAGE_PLATFORMS" {
  default = "linux/amd64,linux/arm64"
}

group "default" {
  targets = ["backend"]
}

# Opt-in, local only — see the header. Not part of `default`.
group "decoders" {
  targets = ["voice-decoder", "aprs-decoder", "ais-decoder", "adsb-decoder", "stub-decoder"]
}

# Shared by every target: the platform list.
target "_multi-platform" {
  platforms = split(",", IMAGE_PLATFORMS)
}

target "backend" {
  inherits   = ["_multi-platform"]
  context    = "."
  dockerfile = "backend/Dockerfile"
  tags       = ["${IMAGE_REPOSITORY}/backend:${IMAGE_TAG}"]
}

# sdr-manager-local's own image (ADR 0007): librtlsdr + the SDR Manager API,
# for whichever machine the dongles are plugged into — often an arm64 Pi.
# Opt-in like its compose profile, so not part of `default`:
#   docker buildx bake sdr-manager-local
target "sdr-manager-local" {
  inherits   = ["_multi-platform"]
  context    = "."
  dockerfile = "services/sdr-manager-local/Dockerfile"
  tags       = ["${IMAGE_REPOSITORY}/sdr-manager-local:${IMAGE_TAG}"]
}

target "voice-decoder" {
  inherits = ["_multi-platform"]
  context  = "decoder"
  tags     = ["${IMAGE_REPOSITORY}/voice-decoder:${IMAGE_TAG}"]
}

target "aprs-decoder" {
  inherits = ["_multi-platform"]
  context  = "decoder/aprs"
  tags     = ["${IMAGE_REPOSITORY}/aprs-decoder:${IMAGE_TAG}"]
}

target "ais-decoder" {
  inherits = ["_multi-platform"]
  context  = "decoder/ais"
  tags     = ["${IMAGE_REPOSITORY}/ais-decoder:${IMAGE_TAG}"]
}

target "adsb-decoder" {
  inherits = ["_multi-platform"]
  context  = "decoder/adsb"
  tags     = ["${IMAGE_REPOSITORY}/adsb-decoder:${IMAGE_TAG}"]
}

target "stub-decoder" {
  inherits = ["_multi-platform"]
  context  = "decoder/stub"
  tags     = ["${IMAGE_REPOSITORY}/stub-decoder:${IMAGE_TAG}"]
}
