# credpal-api · DevOps Assessment

A production-ready Node.js REST API built with Express.js.

---

## Project Structure

```
devops-assessment/
└── app/
    ├── package.json
    ├── src/
    │   ├── index.js     # Express app (routes, middleware, error handlers)
    │   └── server.js    # Port binding + graceful shutdown
    └── tests/
        └── app.test.js  # Jest + supertest test suite
```

---

## Getting Started

```bash
cd app
npm install
```

### Run modes

| Command | Description |
|---|---|
| `npm start` | Production — `node src/server.js` |
| `npm run dev` | Development — hot-reload via nodemon |
| `npm test` | Run Jest test suite |

The server listens on `PORT` (env var) or defaults to **3000**.

---

## API Endpoints

### `GET /health`
Liveness check. Returns service status and process uptime.

```bash
curl http://localhost:3000/health
```
```json
{
  "status": "ok",
  "uptime": 29.08
}
```

---

### `GET /status`
Returns service metadata pulled from `package.json` and the environment.

```bash
curl http://localhost:3000/status
```
```json
{
  "service": "credpal-api",
  "version": "1.0.0",
  "environment": "development",
  "timestamp": "2026-03-09T16:01:10.000Z"
}
```

---

### `POST /process`
Accepts a JSON body with a non-empty `data` string, returns the processed result.

**Valid request:**
```bash
curl -X POST http://localhost:3000/process \
  -H "Content-Type: application/json" \
  -d '{"data": "hello world"}'
```
```json
{
  "message": "processed",
  "input": "hello world",
  "processedAt": "2026-03-09T16:01:45.000Z"
}
```

**Validation error (empty / missing data):**
```bash
curl -X POST http://localhost:3000/process \
  -H "Content-Type: application/json" \
  -d '{}'
```
```json
{
  "errors": [
    { "msg": "data field is required", "path": "data", ... }
  ]
}
```
Returns **400 Bad Request** when `data` is missing, null, or whitespace-only.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `NODE_ENV` | `development` | Runtime environment (`production`, `test`, etc.) |

---

## Tests

```bash
cd app && npm test
```

```
 PASS  tests/app.test.js
  GET /health
    ✓ should return 200 with status "ok"
  GET /status
    ✓ should return 200 with service name "credpal-api"
  POST /process
    ✓ should return 200 with processed result when given a valid body
    ✓ should return 400 when data field is missing
    ✓ should return 400 when data field is an empty string
    ✓ should return 400 when data field is null
  404 handler
    ✓ should return 404 for unknown routes

Tests: 7 passed, 7 total
```

---

## Middleware & Security

| Package | Purpose |
|---|---|
| `helmet` | Sets secure HTTP headers |
| `morgan` | HTTP request logging (`combined` format) |
| `express-validator` | Input validation on `POST /process` |

---

## Graceful Shutdown

The server handles `SIGTERM` and `SIGINT` (e.g. `Ctrl+C` or a container stop signal):

```
[credpal-api] Received SIGINT. Starting graceful shutdown...
[credpal-api] All connections closed. Server shut down cleanly.
```

Active connections are drained via `server.close()` before the process exits. A 10-second hard-exit safety net is in place if shutdown stalls.