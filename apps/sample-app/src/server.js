import http from "http";

const PORT = parseInt(process.env.PORT || "3000", 10);
const APP_VERSION = process.env.APP_VERSION || "1.0.0";
const APP_NAME = process.env.APP_NAME || "CloudPilot Demo Web App";

const server = http.createServer((req, res) => {
  const url = req.url || "/";

  // Health check endpoint
  if (url === "/health" || url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        version: APP_VERSION,
      }),
    );
    return;
  }

  // Root endpoint
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${APP_NAME}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; max-width: 520px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
    h1 { margin-top: 0; color: #6366f1; font-size: 24px; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; background: #065f46; color: #34d399; font-family: monospace; }
    .meta { font-family: monospace; font-size: 13px; color: #94a3b8; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h1>🚀 ${APP_NAME}</h1>
      <span class="badge">LIVE (v${APP_VERSION})</span>
    </div>
    <p>This web application was successfully deployed by <strong>CloudPilot</strong> automated deployment engine.</p>
    <div class="meta">
      <div>Port: ${PORT}</div>
      <div>Node Version: ${process.version}</div>
      <div>Platform: ${process.platform}</div>
      <div>Uptime: ${Math.floor(process.uptime())}s</div>
    </div>
  </div>
</body>
</html>`);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[SampleApp] Server listening on http://0.0.0.0:${PORT}`);
});
