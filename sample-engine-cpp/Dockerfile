FROM alpine:3.20 AS builder
RUN apk add --no-cache cmake make g++ boost-dev
WORKDIR /app
COPY CMakeLists.txt .
COPY src/ src/
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j$(nproc)

FROM alpine:3.20
RUN apk add --no-cache boost-libs libstdc++
WORKDIR /app
COPY --from=builder /app/build/engine .
EXPOSE 9000
CMD ["./engine"]
