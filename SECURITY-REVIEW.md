# Stage 3 Security Review

## Verdict

**SAFE ONLY AFTER SPECIFIED CORRECTIONS**

## Findings

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟠 HIGH | `backend/src/controllers/noteController.ts`; `backend/src/controllers/pyqController.ts`; `backend/src/controllers/adminResourceController.ts`; `backend/src/config/multer.ts` | Note 119-138, 235-244, 255-266; PYQ 52-67, 95-101; admin 313-323; multer 5-13 | Public Cloudinary file URLs bypass moderation after rejection/removal and expose pending uploads; soft removal does not revoke the provider asset | 9/10 |

### Finding 1 — Public provider URLs bypass moderation

Uploaded files receive public Cloudinary raw URLs. Upload responses and student-facing resource responses expose `fileUrl` before moderation. Application-level visibility filters protect database-backed routes, but a previously obtained provider URL remains usable after a resource is rejected or removed because admin removal is soft and does not revoke or delete the Cloudinary object.

Impact:

- Pending uploads can be downloaded by anyone holding the URL.
- Rejected and removed resources remain downloadable through a previously exposed URL.
- Revoking application access does not revoke direct provider access.

Smallest correction: make Cloudinary assets private/authenticated and issue short-lived signed URLs only after checking current approved status, or revoke/delete provider assets on rejection/removal. Do not expose `fileUrl` or `filePublicId` in student-facing responses or upload responses. Existing public assets require migration or invalidation.

## Exposure and authorization assessment

- Note listings, search, details, downloads, thumbnails, reviews, ratings, bookmarks, collections, flashcards, and tutor lookups use the public visibility filter.
- PYQ listing and download use the public visibility filter.
- Admin routes use `protect` followed by `requireRoles("admin")`.
- Note and PYQ owner deletion checks remain present.
- Admin removal is soft removal and retains the Cloudinary object.
- Legacy resources without a moderation field remain visible by design.
- No application ID route was found to expose rejected or removed resources, but direct provider URLs remain exposed.

## Audit and moderation assessment

Moderation state, history, and audit events are written in one MongoDB transaction. Moderator identity comes from the authenticated request context, and timestamps are server-generated. Status/reason metadata validation and audit rollback behavior are covered by the reviewed implementation and integration test.

## Test coverage

- `backend/tests/admin-resource.integration.test.ts`: HTTP route-level integration tests using a disposable MongoDB replica set; covers admin authorization, visibility behavior, and audit rollback.
- `backend/tests/note-upload.test.ts`: direct controller unit tests with mocks.
- `backend/tests/audit-service.test.ts`: direct service unit tests with mocks.
- Coverage does not establish direct-file protection, Cloudinary invalidation, Note direct download, PYQ direct download, search, reviews, ratings, bookmarks, collections, tutor lookup, or owner-deletion behavior.

## Manual checks still needed

1. Obtain a real Note/PYQ `fileUrl`, reject/remove the resource, and request the URL directly.
2. Verify upload responses do not expose usable public file URLs after correction.
3. Test every resource route for pending, rejected, removed, approved, and legacy records.
4. Verify Cloudinary assets are private or invalidated after removal.
5. Exercise admin authorization with revoked sessions, inactive admins, and role changes.
