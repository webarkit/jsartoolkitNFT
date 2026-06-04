FROM emscripten/emsdk:4.0.17

# Install build dependencies and system packages required for canvas compilation
RUN apt-get update && apt-get install -y \
    cmake \
    ninja-build \
    build-essential \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*
