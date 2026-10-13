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