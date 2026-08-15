# SoulPlace

SoulPlace is a full-stack mental healthcare platform that connects patients, doctors, and administrators. This repository is the clean, unified source of truth for the React frontend and the custom Frappe/ERPNext backend app.

## What the application includes

- Patient registration and email-based sign-in, profile management, password reset, doctor discovery, appointment requests, consent records, mood checks, resources, prescriptions, and teleconsult access.
- Doctor application and certificate re-upload, administrator approval or rejection, availability management, appointment confirmation/cancellation/completion, consultations, prescriptions, and teleconsult links.
- Administrator dashboards for patients, doctors, appointments, consultations, prescriptions, consents, audit history, teleconsults, and schedule exceptions.
- Appointment email notifications: the doctor is notified when a patient requests an appointment, and the patient is notified when the doctor confirms or cancels it.
- Session-based Frappe authentication, role-protected APIs and portals, private verification documents, explicit consent tracking, and appointment audit records.
- Manual meeting-link entry, with optional Google Meet OAuth support when a Google client ID is configured.

## Technology

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router, TanStack Query |
| Backend | Frappe Framework v15 custom app |
| ERP | ERPNext v15 |
| Database and services | MariaDB, Redis, Frappe background workers |
| Tests | Vitest, Testing Library, Playwright, Frappe test runner |

## Repository layout

```text
Soulplace_final/
├── frontend/              React/Vite web application
│   ├── src/api/           Frappe API client modules
│   ├── src/pages/         Patient, doctor, admin, and auth pages
│   ├── src/components/    Shared UI and portal shells
│   ├── src/test/          Unit and component tests
│   └── e2e/               Browser smoke tests
├── backend/               Installable Frappe app
│   └── soulplace/
│       ├── soulplace/doctype/  DocTypes and their controllers
│       ├── api.py              Portal RPC endpoints
│       ├── auth.py             Registration and authentication flows
│       ├── events.py           Document event handlers
│       ├── email_notifications.py
│       ├── permissions.py
│       └── hooks.py
└── .github/workflows/ci.yml
```

The main custom DocTypes are `PatientUser`, `Doctor`, `SoulPlace Appointment`, `Consultation`, `Prescription`, `Patient Consent Record`, `Appointment Audit Timeline`, `Teleconsult Session`, `Doctor Schedule Exception`, and `Mobile Device Token`.

## Prerequisites

Install these before starting:

- Git
- Node.js 22 and npm
- Python 3.10 or newer
- Frappe Bench with the Frappe `version-15` branch
- MariaDB and Redis
- ERPNext `version-15`
- `wkhtmltopdf` if PDF print attachments are required

The frontend can run independently for interface work, but real authentication and workflows require the Frappe site.

## 1. Clone the repository

```bash
git clone https://github.com/birbhatia04/Soulplace_final.git
cd Soulplace_final
```

## 2. Set up the backend

### New Bench installation

Create a Frappe v15 bench and site if one does not already exist:

```bash
bench init frappe-bench --frappe-branch version-15
cd frappe-bench
bench new-site soulplace.localhost
bench get-app erpnext --branch version-15
bench --site soulplace.localhost install-app erpnext
```

When `bench new-site` asks for credentials, enter the MariaDB root password and choose a Frappe `Administrator` password. Those passwords are local secrets and must never be committed.

Install the SoulPlace app from this monorepo. Replace the path below with the absolute path to your clone:

```bash
bench get-app soulplace /absolute/path/to/Soulplace_final/backend
bench --site soulplace.localhost install-app soulplace
bench --site soulplace.localhost migrate
bench use soulplace.localhost
```

If the app is already installed, update it with:

```bash
cd /absolute/path/to/frappe-bench
bench --site soulplace.localhost migrate
bench --site soulplace.localhost clear-cache
```

Start Frappe from the bench directory:

```bash
bench start
```

The backend is then available at `http://soulplace.localhost:8000`. Sign in to the Frappe Desk with username `Administrator` and the password selected during site creation.

## 3. Set up the frontend

In a second terminal:

```bash
cd /absolute/path/to/Soulplace_final/frontend
cp .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:8081`. Vite proxies `/api`, `/assets`, `/files`, and other Frappe routes to the target configured in `.env.local`.

Default local configuration:

```dotenv
VITE_FRAPPE_URL=
FRAPPE_PROXY_TARGET=http://soulplace.localhost:8000
VITE_DEMO_MODE=false
VITE_GOOGLE_CLIENT_ID=
VITE_CONSENT_VERSION=1.0
VITE_PAYMENTS_ENABLED=false
VITE_ERROR_REPORTING_URL=
VITE_APP_RELEASE=
```

Keep `VITE_FRAPPE_URL` empty for local same-origin proxying. Never commit `.env.local`, passwords, API keys, app passwords, private certificates, database files, or a complete `frappe-bench` directory.

## Email notifications

Email credentials are configured per Frappe site, not in this repository. Each developer or deployment environment must configure its own sender:

1. Sign in to Frappe Desk as `Administrator`.
2. Open **Email Account** and create an outgoing account.
3. For Gmail, enable two-step verification and create a Google App Password. Do not use the normal Gmail password.
4. Enable outgoing email, set the account as **Default Outgoing**, use `smtp.gmail.com`, port `587`, and TLS.
5. Enter the full Gmail address and its app password, then save and send a test email.
6. Ensure the tested doctor and patient profiles contain real email addresses.
7. Keep the scheduler and workers running with `bench start` locally. In production, enable the scheduler with `bench --site soulplace.localhost enable-scheduler`.

Use a dedicated organization mailbox or transactional email service in production. Do not share or commit one team member's personal email credentials.

## Google Meet and teleconsults

Manual meeting links work without Google configuration. To enable Google OAuth-based link creation, create an OAuth web client in Google Cloud and set its client ID in `VITE_GOOGLE_CLIENT_ID`. Configure the authorized JavaScript origins for the local and deployed frontend URLs. Keep client secrets on the server; do not place them in Vite variables.

## Development checks

Run frontend checks from `frontend/`:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Run the browser smoke tests after both servers are available:

```bash
npm run test:e2e
```

Run backend tests from the bench directory:

```bash
bench --site soulplace.localhost set-config allow_tests true
bench --site soulplace.localhost run-tests --app soulplace
bench --site soulplace.localhost set-config allow_tests false
```

The GitHub Actions workflow runs frontend lint, unit tests, and build checks, then compiles the backend Python and validates all Frappe JSON definitions.

## Production deployment checklist

1. Provision a supported production Frappe v15/ERPNext v15 environment with MariaDB, Redis, workers, scheduler, HTTPS, and backups.
2. Install `backend/` as the `soulplace` Frappe app and run `bench --site <site> migrate` after every backend release.
3. Build the frontend with `npm ci && npm run build` and deploy `frontend/dist/` to a static host or web server.
4. Set the production API URL/proxy, allowed origins, OAuth origins, email account, error-reporting endpoint, and release identifier for that environment.
5. Use separate development, staging, and production sites and credentials. Store secrets in the hosting platform's secret manager.
6. Enable HTTPS, background workers, the scheduler, database backups, monitoring, and log rotation before accepting real patient data.

For horizontal growth, serve the frontend through a CDN, run multiple Frappe web and worker processes behind a load balancer, use managed MariaDB/Redis where appropriate, and scale background queues separately from web traffic. Medical and personal data must remain server-side and be protected according to the laws and policies applicable to the deployment.

## Updating the project safely

Create a feature branch, commit only source/configuration changes, open a pull request, and wait for CI and review before merging. After pulling backend changes, run `bench --site <site> migrate`; after pulling frontend dependency changes, run `npm ci`. Do not commit local databases, user uploads, generated builds, email credentials, or environment files.
