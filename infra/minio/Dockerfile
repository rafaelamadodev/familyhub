FROM golang:1.24-alpine AS build
ARG MINIO_VERSION=RELEASE.2025-10-15T17-29-55Z
RUN apk add --no-cache git ca-certificates
RUN CGO_ENABLED=0 go install -trimpath github.com/minio/minio@${MINIO_VERSION}
RUN cp /go/pkg/mod/github.com/minio/minio@*/LICENSE /MINIO-LICENSE

FROM alpine:3.22
RUN apk add --no-cache ca-certificates
COPY --from=build /go/bin/minio /usr/local/bin/minio
COPY --from=build /MINIO-LICENSE /usr/share/licenses/minio/LICENSE
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
