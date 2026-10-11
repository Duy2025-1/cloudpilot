# CloudPilot Sample Web App

A lightweight, production-ready Node.js containerized web application designed for verifying the **CloudPilot** deployment pipeline.

## Features:

- Standard HTTP server listening on configured `PORT` (default 3000).
- HTTP Health Check at `/health` returning status 200 JSON.
- Dockerfile based on `node:20-alpine` running as unprivileged `node` user.
