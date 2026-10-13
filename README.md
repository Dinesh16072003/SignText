# Signtext

Signtext reads American Sign Language from a webcam or an uploaded video and
shows the spoken text, like a translator for signing.

## What exists now

- A working sign-in / account flow and translations web app.
- A FastAPI backend (`backend/`) that owns authentication with short-lived
  access tokens and a rotating refresh token kept in an HttpOnly cookie.
  Cookies are the only way the refresh token travels.
- A React single-page app (`frontend/`) that talks to that backend.
- Versioned migrations under `backend/migrations/` that upgrade the database on
  startup.
- Hand tracking with MediaPipe and the sign-recognition model are planned, not
  wired in yet. The Python training work lives in `ml/`.

## Layout

- `backend/` – FastAPI service: auth, rate limiting, security headers, body
  limits, SQLAlchemy models and versioned migrations, and a pytest suite.
- `frontend/` – Vite + React SPA (`src/` holds components, context, services,
  hooks, pages, data and assets).
- `database/` – archived SQL from the old Supabase setup; not used by the
  current backend (see `database/archive/README.md`).
- `ml/` – Python training for the future recognition model.
- `notes/` – development notes.

## Run it

Backend (Python, from the repo root):

```sh
cd backend
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

Frontend (from the repo root):

```sh
cd frontend
npm install
npm run dev
```

The app opens on <http://localhost:5173> and calls the backend on
<http://localhost:8000>. Copy `backend/.env.example` to `backend/.env` (and
`frontend/.env.example` to `frontend/.env`) before first run.

## Tests

```sh
cd backend && .venv/Scripts/python.exe -m pytest -q
cd frontend && npm run test
```

Frontend lint: `npm run lint`. Production build: `npm run build`.

## Deployment checklist

Go through this before pointing the app at real users:

- **Set a real secret key.** Generate a long random value for
  `SIGNTEXT_SECRET_KEY` in `backend/.env` and keep it out of git:
  `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
- **Serve everything over HTTPS.** The backend's security headers (including
  HSTS) are only emitted on HTTPS connections, so the site must be served
  over HTTPS from the start.
- **Configure the allowed origins.** Set `SIGNTEXT_CORS_ORIGINS` to the real
  frontend origin, and if the API runs on a different host than the frontend,
  add that host to the `connect-src` directive in the CSP meta tag in
  `frontend/index.html`.
- **Use managed Postgres with migrations.** Point `SIGNTEXT_DATABASE_URL` at a
  real Postgres instance. Back it up, and let the migrations run once on
  startup (`SIGNTEXT_RUN_MIGRATIONS=1`) before traffic arrives.
- **Mark the cookie Secure.** Set `SIGNTEXT_COOKIE_SECURE=1` so the refresh
  cookie is always sent only over HTTPS.
- **Think about rate limiting behind a proxy.** The login and signup limiters
  are in-memory and keyed on the client IP. Behind a reverse proxy, either
  configure the proxy to pass the real client address (it must send a trusted
  `X-Forwarded-For`), or enforce sensible limits at the proxy itself.
- **Decide the cookie SameSite story if frontend and backend live on different
  domains.** The refresh cookie is `SameSite=Lax`, which a cross-site request
  will not carry, so refresh would silently stop working across domains.
  Cleanest option: serve both from one domain through a reverse proxy. If they
  must be on different domains, the API needs `SameSite=None; Secure` and the
  extra CSRF surface that opens up needs to be handled. `SameSite=Lax` is
  correct as long as the app and API share a registrable domain.