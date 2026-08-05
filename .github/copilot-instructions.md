# GitHub Copilot instructions — smart-hub

Purpose: quick, actionable guidance for Copilot/Copilot CLI sessions working in this repository.

---

## Quick build / run / lint commands (project-scoped)

- Frontend (Next.js, in `frontend/`):
  - Dev: cd frontend && npm run dev
  - Build: cd frontend && npm run build
  - Start (production): cd frontend && npm run start
  - Lint: cd frontend && npm run lint
  - Notes: No test scripts are configured in `frontend/package.json`.

- Backend (Express + TypeScript, in `backend/`):
  - Dev (local iteration): cd backend && npm run dev  # uses ts-node-dev
  - Build: cd backend && npm run build  # tsc -> outputs to `dist/`
  - Start (production): cd backend && npm run start  # runs `node dist/index.js`
  - Notes: No test scripts are configured in `backend/package.json`.

- ai-service (Python FastAPI stub, in `ai-service/`):
  - This folder currently contains a minimal `main.py` skeleton. No requirements or run scripts are present.

- Single-test guidance: there are no test runners configured in this repo. If/when a test runner is added, run single tests using the test-runner's documented CLI (e.g., for Jest: `npm test -- -t "<pattern>"`).

---

## High-level architecture (big picture)

- Monorepo with three main pieces:
  - frontend/: Next.js 16 React app (app router, src/app). User interface served by Next; communicates with backend via `/api/*` endpoints.
  - backend/: Express + TypeScript API. Handles authentication (JWT), file uploads (multer + Cloudinary), PDF parsing, MongoDB via Mongoose, and routes under `/api/*` (auth, notes, tutor, syllabus, timetable, etc.). Server starts listening then calls connectDB() so the HTTP server is available even while DB connects.
  - ai-service/: small Python FastAPI microservice placeholder (phase 3). Not wired into project scripts.

- Typical request flow: browser (frontend) -> backend Express API -> (optional) Cloudinary, Groq / external APIs, MongoDB.

- Build output and deployment:
  - Frontend: Next.js build artifacts (Next) — deploy via Vercel/Node as desired.
  - Backend: tsc compiles TS to `backend/dist/`; production start runs `node dist/index.js`.

---

## Important environment variables (observed in backend source)

- MONGO_URI — MongoDB connection string
- JWT_SECRET, JWT_REFRESH_SECRET — JWT signing keys
- CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET — Cloudinary credentials for uploads
- GROQ_API_KEY — Groq / Sanity-ish API key used by several controllers/services
- CLIENT_ORIGIN — front-end origin used by CORS
- PORT, NODE_ENV — standard runtime variables

Place `.env` at `backend/` when running the backend locally (backend uses dotenv). Do NOT commit secrets.

---

## Code & repo conventions specific to smart-hub

- Backend:
  - TypeScript source lives under `backend/src/` and compiles to `backend/dist/` via `tsc`.
  - Development iteration uses `ts-node-dev` (`npm run dev`) so changes reload automatically.
  - Global error handler is intentionally registered after route mounting in `src/index.ts`.
  - Authentication middleware expects JWTs signed with `JWT_SECRET`.
  - Database connection is initiated by `connectDB()` called after server listen.

- Frontend:
  - Uses Next.js (version in package.json: 16.2.2) and the `src/app` folder (app router). This repository includes an explicit local directive (see frontend/AGENTS.md) that this Next.js may have breaking changes vs training data — follow `node_modules/next/dist/docs/` if editing framework-level code.
  - Styling: Tailwind is used (tailwindcss/devDependency). Components and contexts live under `src/components` and `src/context`.
  - Linting: `eslint` is configured as an npm script in `frontend/package.json` (no .eslintrc checked in here).

- Commits created by Copilot helpers (when making git commits) should include the required commit trailer:
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>

- AI agent rule files discovered:
  - frontend/AGENTS.md — contains a mandatory rule: "This is NOT the Next.js you know". Respect it for any frontend code changes.
  - frontend/CLAUDE.md — imports AGENTS.md. When generating frontend code, apply those instructions.

---

## Files and places to check first

- frontend/README.md — Next.js scaffolding and dev hints.
- frontend/AGENTS.md and frontend/CLAUDE.md — agent-specific rules that must be applied for frontend edits.
- backend/src/index.ts — server bootstrap and route wiring (global error handler placement and DB connect behavior).
- backend/package.json — build/dev scripts and dependency list.

---

## Helpful safety notes for Copilot sessions

- Do not assume Next.js or Node APIs are identical to public training-time behavior; consult `node_modules/next/dist/docs/` when touching framework internals (frontend/AGENTS.md).
- Avoid editing or committing secrets. Check `.env` usage in backend and document any secret-like variables as environment configuration only.
- Avoid modifying `node_modules/` or `.next/` artifacts.

---

If this file already exists in the repository root under `.github/copilot-instructions.md`, merge important differences rather than replacing verbatim.

---

Last updated: autogenerated by Copilot CLI
