# Saylani Rider App

Rider collection app built with React and Vite. The Node service serves both the production frontend and `/api` on one origin, and reads rider data from PostgreSQL.

## Local development

Requirements: Node.js 20.9 or newer and access to the Saylani rider/branch PostgreSQL database.

1. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` and a unique `AUTH_SECRET`.
2. Install dependencies with `npm ci`.
3. Start the API using `npm run api`.
4. In a second terminal, start Vite using `npm run dev` and open the printed local URL.

The development server proxies `/api` to `127.0.0.1:3001`. Use an active Rider login account; branch and city manager dashboards are not part of this application.

## Production deployment

Deploy as a Node web service that can run the app and connect to Neon. Do not deploy this as a static-only site because its API and PostgreSQL connection run in the Node service.

- Runtime: Node.js 20.9 or newer
- Install/build command: `npm ci && npm run build`
- Start command: `npm start`
- Set `NODE_ENV=production` and the host-provided `PORT` (the app binds to `0.0.0.0` by default in production).
- Apply `ops/create-box-condition-table.sql` to the Saylani database before granting the app role access to that table. The rider API detects the table and enables the form after it exists; until then, task timelines and existing database reads continue to work.
- Create a dedicated restricted database role by reviewing and applying `ops/production-role.sql` as a database administrator, then set `DATABASE_URL` to that role's URL in the service environment. The role script grants access to the box-condition table, so apply the migration first.
- Set `AUTH_SECRET` to a new random secret with at least 32 characters. For example, generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.
- Set `WEB_ORIGINS` to the exact public HTTPS origin, with no trailing slash (for example `https://riders.example.org`). Keep the API and frontend on this same origin.
- Set `TRUST_PROXY=true` only if the hosting platform sets a trusted `X-Forwarded-For` header. Otherwise leave it `false`.

The service checks the database at `/api/health`; do not expose database credentials in frontend build variables. Configure the host to restart the service on failure and use HTTPS. For Render, use a Web Service and its assigned `PORT`; the service binds to `0.0.0.0` by default.

## Database safety

The app reads rider, task, box, city, partner, collection, and audit data. Rider actions write task progress, notifications, collection records, box-condition reports, and audit records. The permission script grants the app only the table reads and column/table writes those actions need; inspect it against your current schema before applying. It is a template and has not been run against the live database.

The database owner credential previously used during setup should be rotated before production because it was shared in chat. Keep the replacement and app-role credentials in the hosting provider's secret settings and out of source control. `.env.local` is ignored by Git.
