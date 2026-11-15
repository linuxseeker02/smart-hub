# Smart Academic Resource Hub — Verified Project Progress and Handover Log

**Repository:** `/home/rajiv/projects/smart-hub`  
**Branch at record creation:** `main`  
**Latest commit at record creation:** `8c61e71 chore(ci): add Copilot setup steps and Playwright e2e scaffold`  
**Record created:** 2026-10-25  
**Record status:** Append-only handover record

This document records the state observed in the repository and the verification evidence available at the time of writing. It does not replace the original academic synopsis. No canonical synopsis document was found in the checked-out repository; the synopsis objectives below are transcribed from the approved project scope supplied for this work and from existing implementation notes. Historical reports are labelled as such rather than being presented as new verification.

## A. Project identity and objectives

### Project identity

**Project title:** Smart Academic Resource Hub — A Secure, AI-Powered Student Note-Sharing and Learning Platform.

**Purpose:** Provide students with a centralized academic resource platform for uploading, discovering, reading, and learning from notes, with authentication, AI-assisted processing, quizzes, academic planning tools, and security controls suitable for an academic cybersecurity project.

### Technology stack observed

| Area | Current technology |
|---|---|
| Frontend | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | MongoDB through Mongoose; MongoDB Atlas is the intended external database |
| File storage | Cloudinary |
| AI | Groq SDK from the Node.js backend |
| Additional service | `ai-service/` contains a minimal FastAPI skeleton and is not part of the active request flow |
| Testing | Vitest for backend tests and focused frontend Axios tests; Playwright scaffold exists for browser tests |

### Original synopsis objectives

The approved scope includes:

- Secure student authentication.
- Academic-note uploads and centralized discovery.
- AI summaries and keywords.
- Subject classification.
- Five-question quizzes.
- Student/admin role-based access control.
- Secure refresh-token lifecycle.
- Tamper-evident audit logs.
- SHA-256 file-integrity verification.
- Prompt-injection safeguards and AI output validation.
- Formal threat modelling.
- Functional, integration, authentication, and security testing.
- Final academic report, demonstration, and reproducible delivery evidence.

Later work added implementation hardening and verification infrastructure, including session-backed refresh-token rotation, frontend single-flight refresh handling, upload rollback tests, and dependency remediation. These are supporting implementation decisions, not replacements for the original synopsis objectives.

## B. Executive project status

### Implemented or substantially implemented

- Authentication with bcrypt password hashing, JWT access and refresh cookies, and generic invalid-credential responses.
- Persistent authentication sessions with hashed refresh-token state, rotation, reuse detection, and server-side logout revocation.
- Frontend Axios refresh handling with single-flight coordination, one retry per original request, endpoint exclusions, invalidation events, and public-request opt-out.
- Note upload validation, Cloudinary cleanup, database rollback/reconciliation, and AI processing integration.
- Structured AI output validation, including exactly five quiz questions with four options and a valid answer per question.
- Centralized browsing/search and multiple academic-support modules.
- Focused backend regression/security tests and frontend interceptor tests.
- Selected frontend production dependency remediation.

### Partially implemented or incomplete

- AI processing remains asynchronous/background work whose live integration reliability has not been established.
- Subject classification is not clearly implemented as a distinct, verified feature.
- Upload security relies on existing validation and Multer filtering; persistent file-integrity verification is absent.
- Public and protected route coverage exists, but server-side admin authorization and ownership policy require a dedicated audit.
- AI prompt-injection resistance is not a formally implemented or adversarially verified control.

### Not implemented or not yet evidenced

- Tamper-evident audit logging.
- Persistent SHA-256 file-integrity field and verification workflow.
- Formal threat model.
- Comprehensive live integration, browser concurrency, and production-like end-to-end evidence.
- Verified student/admin RBAC enforcement.
- Final academic evidence package and demonstration record.

### Current phase and immediate next task

Authentication/session hardening through Phase 4C-4 and the selected frontend dependency remediation are present in the worktree. The next task is **read-only inspection and verification of RBAC, not immediate implementation**.

## C. Implementation inventory

| Feature/objective | Current status | Evidence and file paths | Tests/evidence | Remaining work |
|---|---|---|---|---|
| Centralized note organization and browsing | Implemented; verification incomplete | `backend/src/routes/notes.ts`, `backend/src/controllers/noteController.ts`, `frontend/src/app/browse/`, `frontend/src/app/search/`, `frontend/src/app/notes/` | Frontend build passed; upload tests cover persistence paths | Verify filtering, pagination, ownership, public access, and live discovery behavior |
| AI note-processing pipeline | Partially implemented | `backend/src/controllers/noteController.ts`, `backend/src/services/extractText.ts`, `backend/src/services/aiService.ts` | Upload tests cover mocked processing and rollback; no live Groq/Cloudinary/MongoDB integration | Verify extraction coverage, background failure handling, retries, and observability |
| AI summaries, keywords, subject classification, and five-question quiz requirements | Partially implemented | `backend/src/services/aiService.ts` validates title, summary, keywords, and exactly five questions with four options | `backend/tests/quiz-validator.test.ts`: six tests passed; upload tests cover malformed AI output | Distinct subject classification is not verified; test grounded/adversarial inputs and end-to-end outputs |
| Student/admin RBAC | Not verified | `backend/src/models/User.ts` defines `role: "student" \| "admin"`; routes broadly use `protect` but no verified admin authorization middleware was found | No dedicated RBAC audit or test suite | Perform read-only route/controller/ownership audit before implementation |
| Authentication, JWT, cookies, sessions, refresh rotation, and reuse detection | Implemented and verified | `backend/src/controllers/authController.ts`, `backend/src/utils/sessionTokens.ts`, `backend/src/models/AuthSession.ts`, `backend/src/middleware/authMiddleware.ts`, `backend/src/routes/auth.ts` | Backend auth/session tests are included in the 77 passing tests; focused logout/refresh history also passed | Review secret entropy/startup policy and perform live integration testing when approved |
| Logout and session revocation | Implemented and verified | `backend/src/controllers/authController.ts`; logout route intentionally has no `protect` middleware to allow refresh-cookie fallback; `frontend/src/components/Navbar.tsx` preserves local state on server failure | Logout tests passed as part of 77 backend tests; frontend build/lint passed | Add browser-level verification when browser dependencies are available |
| Frontend automatic token refresh and authentication failure handling | Implemented and verified in mocks | `frontend/src/lib/api.ts`, `frontend/src/context/AuthContext.tsx`, `frontend/tests/api-interceptor.test.ts` | 8/8 interceptor tests passed using Axios adapter seam; no live browser concurrency test | Verify browser behavior and event handling in an integrated environment |
| Tamper-evident audit logging | Not implemented | No audit-log model/service or tamper-evidence chain was identified in the inspected source | No tests | Design and implement only after RBAC and scope approval |
| SHA-256 file integrity verification | Not implemented | Refresh tokens are SHA-256 hashed in `backend/src/utils/sessionTokens.ts`; no persistent uploaded-file digest/check was identified | No uploaded-file integrity tests | Add note/file digest storage and verification after approved design |
| Upload validation and security | Implemented; verification incomplete | `backend/src/controllers/noteController.ts`, `backend/src/config/timetableMulter.ts`, upload routes, frontend upload form | `backend/tests/note-upload.test.ts`: 12 tests passed; rollback and cleanup paths covered | Verify MIME/content distinction, limits, filename handling, and live Cloudinary behavior |
| AI input sanitization, output validation, and prompt-injection mitigation | Partially implemented | `backend/src/services/aiService.ts` uses structured JSON instructions and validates output; tutor flow is in `backend/src/controllers/tutorController.ts` and `frontend/src/components/TutorChat.tsx` | Structured output tests passed; no adversarial prompt-injection suite | Add explicit untrusted-content boundaries, sanitization policy, output constraints, and abuse tests |
| Threat modelling | Not implemented | No formal threat model document was found in the checked-out repository | No evidence | Produce a formal threat model covering assets, trust boundaries, threats, controls, and residual risk |
| Functional, integration, authentication, and security testing | Partially implemented | Backend Vitest suite, frontend interceptor test, Playwright scaffold, and existing implementation notes | Backend 77/77 and frontend 8/8 pass; no live external-service or browser-concurrency proof | Expand to RBAC, IDOR/BOLA, upload, session, AI, and integration cases |
| Final report, demonstration, and delivery evidence | Not implemented | No canonical final evidence package or progress record existed before this file | Current record is the first durable handover record | Collect reproducible commands, screenshots/video where approved, limitations, and final academic documentation |

## D. Authentication and session-security history

### Current implementation

- Registration and login hash passwords with bcrypt and create a persistent `AuthSession`.
- Access tokens expire after **15 minutes** (`ACCESS_TOKEN_EXPIRES_IN = "15m"`).
- Refresh tokens expire after **7 days** (`REFRESH_TOKEN_EXPIRES_IN = "7d"`).
- Access tokens use `sub`, `sid`, `typ: "access"`, `iat`, and `exp`; the legacy `id` claim is accepted only when it matches `sub`.
- Refresh tokens use `sub`, `sid`, `fid`, `jti`, `typ: "refresh"`, `iat`, and `exp`.
- JWT signing and verification are restricted to HS256.
- JWT configuration requires distinct access and refresh secrets with minimum lengths. Length checks do not prove cryptographic entropy.
- Refresh persistence stores only the SHA-256 hash of the complete refresh JWT in `AuthSession.currentTokenHash`; the field is excluded by default and explicitly selected for rotation checks.
- Sessions track `userId`, immutable `sessionId`, immutable `familyId`, current token timestamps, `lastUsedAt`, and optional revocation metadata.
- Refresh rotation uses an atomic compare-and-set update matching the user, session, family, unrevoked state, current hash, and unexpired token.
- A confirmed stale-token replay revokes active sessions in the affected token family with `revokedReason: "reuse_detected"`. Ambiguous database failures do not automatically revoke a family.
- Logout validates access and/or refresh claims, rejects mismatched valid cookies, atomically revokes the intended session with `revokedReason: "logout"`, and clears cookies. Repeated logout of an already revoked session is idempotent.
- Cookies are `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` only in production. Cookie names remain `accessToken`, `token`, and `refreshToken`.
- The frontend Axios client uses `withCredentials: true`, excludes login/register/logout/refresh from automatic refresh, coordinates concurrent refreshes through one module-level promise, retries each original request once, and dispatches `smart-hub:auth-invalidated` when refresh fails.
- `AuthContext` clears local user state after that invalidation event.
- Requests can set `skipAuthRefresh: true`; public note search and note-detail loading use this opt-out.
- Navbar logout keeps local authentication state and presents a generic retryable error when server-side logout fails. It does not claim successful revocation in that case.

### Verification boundary

The backend tests validate mocked controller and model interactions, including rotation filters, replay handling, logout mismatch handling, and failure responses. The frontend tests validate the Axios interceptor through a local adapter. These tests do not prove MongoDB atomicity under live concurrency, browser cookie behavior, production key entropy, or production end-to-end behavior.

## E. Dependency security remediation

### Frontend production dependency changes

The following current manifest/lockfile state is present and independently inspected:

| Package | Earlier reported version | Current version in worktree | Current status |
|---|---:|---:|---|
| `next` | `16.2.2` | `16.4.3` | Updated |
| `axios` | `1.14.0` | `1.20.0` | Updated |
| `form-data` | `4.0.5` | `4.0.6` | Updated transitively |
| `follow-redirects` | `1.15.11` | `1.16.1` | Updated transitively |
| `sharp` | `0.34.5` | `0.35.5` | Updated through Next resolution |
| `js-cookie` | `3.0.8` | Absent | Removed after source-usage inspection |
| `@types/js-cookie` | Present earlier | Absent | Removed with unused package |

Vitest remains `^2.1.9`; development tooling was intentionally not upgraded as part of the production remediation.

### Audit evidence

- Earlier frontend audit: **22 findings** (historical report).
- Current independently run frontend audit: exit code **1**, with **14 findings**: 1 low, 5 moderate, 6 high, and 2 critical.
- The current remaining frontend findings are reported as development/test tooling or transitive tooling risks, including Vitest/Vite/esbuild-related packages and other build-time dependencies. They must not be described as zero risk, but their runtime exposure differs from production request-path dependencies.
- Earlier backend audit: **18 findings** (historical report: 5 moderate, 10 high, 3 critical). That report was not regenerated during this documentation task; backend dependency remediation is outside this task's scope.

The dependency tree is therefore **not vulnerability-free**. Future remediation should inspect current advisories and compatibility before changing Vitest/Vite/esbuild or backend packages.

## F. Validation and testing evidence

| Check | Reported result | Independently verified now? | Evidence or limitation |
|---|---|---|---|
| Backend automated tests | 77/77 passed | **Yes** | `cd backend && npm test -- --run`; 10 test files, 77 tests, exit code 0 |
| Frontend interceptor tests | 8/8 passed | **Yes** | `cd frontend && npm test -- --run tests/api-interceptor.test.ts`; 1 file, 8 tests, exit code 0 |
| Frontend lint | 0 errors, 11 warnings | **Yes** | `cd frontend && npm run lint`; exit code 0; warnings are hook dependencies, raw images, and one unused variable |
| Frontend production build | Passed | **Yes** | `cd frontend && npm run build`; Next 16.4.3 build completed, exit code 0 |
| Backend production build | Previously passed | No, not rerun for this record | Historical result from the preceding implementation work |
| `git diff --check` | Previously passed | **Yes** after this record | Run after creating this file; result recorded in the final handover response |
| Manual login/logout and protected-route testing | Reported in implementation notes | No | Existing notes describe flows, but no current browser session was run for this record |
| Refresh and logout failure handling | Mocked tests passed | Partly | Backend controller tests and frontend adapter tests pass; no browser or live database proof |
| Dependency audit | 14 frontend findings after remediation | **Yes** for frontend totals | `cd frontend && npm audit --json`; exit code 1 with metadata totals above |
| MongoDB/Cloudinary/Groq integration | Some earlier sessions reported connectivity and flow observations | No | No live services or production credentials were contacted during this record |
| Browser/Playwright testing | Scaffold exists; earlier launch was blocked by `libnspr4.so` | No | No claim of browser concurrency or full E2E verification |

The backend test output includes expected stderr from tests exercising failure paths; these messages did not cause test failures.

## G. Outstanding work, prioritized against the synopsis

1. **Read-only RBAC audit — next approved task.** Inspect user roles, every route/controller authorization decision, resource ownership, admin-only operations, and IDOR/BOLA exposure. Do not implement until the audit findings are reviewed and the scope is approved.
2. **Server-side authorization and ownership enforcement.** Add only the approved student/admin rules and ownership checks after the audit.
3. **Tamper-evident audit logging.** Define event coverage, append-only storage, integrity chaining/signing, access controls, retention, and verification tests.
4. **SHA-256 file-integrity verification.** Define whether the digest covers the uploaded bytes, stored object, or both; persist and verify it without exposing sensitive file data.
5. **AI subject classification and five-question evidence.** Confirm the intended classification contract and add end-to-end validation for exactly five questions and four options.
6. **Prompt-injection and AI output safeguards.** Treat uploaded/document text and tutor input as untrusted, establish grounding and output schemas, and test adversarial content.
7. **Formal threat model.** Document assets, actors, trust boundaries, abuse cases, mitigations, residual risks, and assumptions.
8. **Systematic functional/security testing.** Cover authentication, refresh/reuse, logout, RBAC, IDOR/BOLA, uploads, file types, AI failures, rate/abuse cases, and integration behavior.
9. **Final evidence and academic delivery.** Collect exact commands, reproducible environment details, limitations, demonstration evidence, final report content, and approved screenshots or recordings.

These are requirements derived from the approved synopsis unless explicitly marked as an implementation detail above; no unrelated feature roadmap is added here.

## H. Exact resume instructions

1. Open `/home/rajiv/projects/smart-hub` and read this progress record.
2. Run `git status --short`, preserve all existing modifications, untracked files, and deletions, and do not reset, clean, stash, or discard work.
3. Read the original synopsis when it is located and confirm the current milestone against this record.
4. Perform the **read-only inspection and verification of RBAC first**.
5. Review the RBAC audit findings and agree the implementation scope before changing source code.
6. Implement only the approved RBAC scope, preserving unrelated work.
7. Run the agreed targeted tests, builds, lint checks, and security checks; record exact commands and results.
8. Update this progress record after the milestone is independently verified, preserving prior entries.
9. Continue with the next synopsis requirement in the priority order above.

The next task is explicitly **inspection and verification of RBAC, not immediate implementation**.

## I. Decision log and future updates

### Decision log

| Date | Decision | Reason | Implementation/verification evidence | Outstanding issue or next approved task |
|---|---|---|---|---|
| 2026-10-25 | Create a durable project progress record at `docs/PROJECT_PROGRESS_LOG.md` | No equivalent repository progress/handover file was found; development is paused | Current repository inspection and this append-only record | Locate the canonical synopsis if stored outside the checkout |
| 2026-10-25 | Treat authentication/session hardening through Phase 4C-4 as implemented but distinguish mocked verification from live behavior | Source and automated tests provide substantial evidence, but no live MongoDB/browser concurrency test exists | Backend 77/77 and frontend interceptor 8/8 independently passed | Perform browser/live integration checks only when explicitly approved |
| 2026-10-25 | Preserve remaining frontend audit findings rather than upgrading development tooling during production remediation | The approved dependency task limited changes to production dependencies | Current frontend audit reports 14 findings; Vitest remains 2.1.9 | Plan a separate tooling remediation with compatibility review |
| 2026-10-25 | Make RBAC inspection the next task, before implementation | User role fields exist, but verified server-side authorization coverage is not established | `backend/src/models/User.ts` and route inventory show the need for an audit | Conduct read-only RBAC and ownership audit |

### Append-only work-session template

Copy the following template for each future session; do not rewrite earlier entries.

```markdown
## Work session: YYYY-MM-DD

**Objective:**

**Starting Git state:**
- Branch:
- Latest commit:
- Existing modifications/untracked/deletions preserved:

**Files changed by this session:**

**Implementation details:**

**Tests and exact results:**
- Command:
- Exit code:
- Result:

**Security considerations:**

**Remaining work and limitations:**

**Next approved step:**
```
