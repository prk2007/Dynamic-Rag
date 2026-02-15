FROM postgres:15-alpine

# Install build dependencies for pgvector
RUN apk add --no-cache \
    git \
    build-base

# Install pgvector 0.5.1
# Build without LLVM bitcode support (requires clang which adds significant size)
RUN cd /tmp && \
    git clone --branch v0.5.1 https://github.com/pgvector/pgvector.git && \
    cd pgvector && \
    # Build just the shared library, skip bitcode
    make vector.so sql/vector--0.5.1.sql && \
    # Install manually
    cp vector.so /usr/local/lib/postgresql/vector.so && \
    cp sql/vector--0.5.1.sql /usr/local/share/postgresql/extension/ && \
    cp sql/vector--*.sql /usr/local/share/postgresql/extension/ && \
    cp vector.control /usr/local/share/postgresql/extension/ && \
    cd / && \
    rm -rf /tmp/pgvector

# Cleanup build dependencies to reduce image size
RUN apk del git build-base
