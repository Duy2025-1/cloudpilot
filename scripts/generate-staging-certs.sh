#!/usr/bin/env bash
# Generates self-signed SSL certificates for CloudPilot Staging environment in Linux/macOS
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="${SCRIPT_DIR}/../docker/nginx/certs"

mkdir -p "${CERTS_DIR}"

CERT_PATH="${CERTS_DIR}/staging.crt"
KEY_PATH="${CERTS_DIR}/staging.key"

echo "Generating self-signed SSL certificate for CloudPilot Staging..."

openssl req -x509 -nodes -days 1825 -newkey rsa:2048 \
  -keyout "${KEY_PATH}" \
  -out "${CERT_PATH}" \
  -subj "/CN=cloudpilot.local/O=CloudPilot/C=VN" \
  -addext "subjectAltName=DNS:localhost,DNS:cloudpilot.local,DNS:staging.cloudpilot.local,IP:127.0.0.1"

chmod 600 "${KEY_PATH}"
chmod 644 "${CERT_PATH}"

echo "Successfully generated staging SSL certificates:"
echo " - Certificate: ${CERT_PATH}"
echo " - Private Key: ${KEY_PATH}"
