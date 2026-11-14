# System overview

The browser React shell calls the REST API through a same-origin `/health` proxy. Fastify reads validated configuration and uses a bounded PostgreSQL pool. `/health/live` confirms process availability; `/health` performs SELECT 1 and returns HTTP 503 when PostgreSQL is unavailable. Responses expose no database credentials or exception details. Central errors contain a stable code, public message and request ID; request validation is JSON Schema based. Raw errors remain in server logs; do not log request payloads or connection URLs.

Dependencies point from applications toward shared contracts and pure music types. The UI package has no API/database dependency. The music domain imports only Zod and has no browser, SQL or audio coupling. The API contains no song CRUD. Add versioned `/api/v1` routes when real resources exist. Future persistence adapters must validate domain invariants before writing.

Frontend navigation uses hash routes to keep static hosting simple. Theme follows the OS initially and persists explicit selection. Responsive wrapping, semantic navigation, keyboard focus and status announcements provide a basic accessible foundation. No final UX or music editor is claimed.

Docker Compose starts PostgreSQL, then a one-shot migration service, API and Vite. Services use separate configuration and health dependencies. PostgreSQL has a named volume; only loopback host ports are exposed. Pool and HTTP service close on termination signals. CI checks migration replay and real PostgreSQL connectivity in addition to isolated failure tests.

Before internet exposure add authentication, authorization, rate limits, HTTPS termination, restricted CORS if cross-origin, log redaction policy and production static hosting. Those are Sprint 1 design inputs, not implemented features.
