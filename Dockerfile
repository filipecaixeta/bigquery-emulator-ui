# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy go mod and sum files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o bigquery-emulator-ui .

# Final stage
FROM alpine:latest

WORKDIR /app

# Install CA certificates for HTTPS connections
RUN apk --no-cache add ca-certificates

# Copy the binary from the builder stage
COPY --from=builder /app/bigquery-emulator-ui .

# Copy static files
COPY --from=builder /app/static ./static

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
CMD ["./bigquery-emulator-ui"]
