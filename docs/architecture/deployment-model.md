# Deployment model

Local execution uses Docker Compose with PostgreSQL persistence and one application image built from a committed npm lockfile. Vite serves development assets and proxies health calls. This Compose configuration is for local development; no deployment was performed.

Future hosting can serve Vite's static dist via a web server/CDN, route API paths to the stateless Node service, and use managed or self-hosted PostgreSQL. API configuration enters through environment variables or a secrets manager. Run migrations as a single release job before starting compatible application instances. Keep application instances disposable; audio remains in the browser. No AWS dependency exists.

Production needs TLS, backups with tested restores, credentials rotation, least-privilege runtime database roles, access controls, monitoring, resource limits and an explicit data-retention policy. Never expose the development Vite server publicly. Split build/runtime stages and remove dev dependencies when creating the actual production deployment. Major-tag container images currently receive patches on rebuild; use reviewed digest pins for reproducible production releases.
