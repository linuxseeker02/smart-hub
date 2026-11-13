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

## Cloudinary Remediation Follow-up

### Verdict

**SAFE ONLY AFTER SPECIFIED CORRECTIONS**

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟠 HIGH | `backend/src/utils/resourceVisibility.ts`; `backend/src/utils/resourceFileAccess.ts`; `docs/ADMIN_RESOURCE_MODERATION.md` | `resourceVisibility.ts:5-6`; `resourceFileAccess.ts:17-21`; legacy asset section in documentation | Legacy records/assets remain publicly accessible through old Cloudinary URLs; authenticated `private_download_url()` does not convert or reliably access those public assets | 10/10 |
| 2 | 🟡 MEDIUM | `backend/src/controllers/noteController.ts`; `frontend/src/components/NoteCard.tsx` | `noteController.ts:704-722`; `NoteCard.tsx:177` | The thumbnail endpoint redirects to a signed raw PDF URL rather than an image thumbnail, so the frontend `<img>` cannot render it | 10/10 |

### Evidence and corrections

Legacy assets were uploaded with the former public raw delivery configuration. The new helper requests authenticated raw delivery and cannot change the delivery type of an existing asset. Old public URLs therefore remain usable after database rejection or removal. The smallest safe correction is a separately verified Cloudinary migration/invalidation of legacy assets, or denying legacy file access until each asset has been migrated.

The prior thumbnail route constructed an image delivery URL, while the remediation redirects to `private_download_url()` for the raw PDF. The smallest correction is to provide a provider-supported, authenticated image thumbnail path for PDF assets, or deliberately replace the UI with a non-image preview. This requires provider-backed validation.

### Test classification and gaps

- `backend/tests/resource-file-access.test.ts`: mocked unit tests; 11 passed.
- `backend/tests/note-upload.test.ts`: mocked controller unit tests; 12 passed.
- `backend/tests/admin-resource.integration.test.ts`: disposable MongoDB integration test, not executed because `127.0.0.1:27018` was unavailable.
- Real Cloudinary tests: none.
- Manual provider tests: none.

Not demonstrated: old public URL behavior after moderation/removal, private-download access to newly authenticated raw assets, actual five-minute expiry enforcement, thumbnail bytes/content type, complete live serialization coverage, and frontend end-to-end preview behavior.

## Final Cloudinary Security Audit

### Verdict

**NOT SAFE**

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🔴 CRITICAL | `backend/src/utils/resourceVisibility.ts`; `docs/ADMIN_RESOURCE_MODERATION.md` | `resourceVisibility.ts:5-7`; docs 51, 78-79 | Legacy public Cloudinary URLs remain usable after moderation rejection/removal; application restrictions cannot revoke direct provider access | 10/10 |
| 2 | 🟠 HIGH | `backend/src/controllers/noteController.ts` | 751-764 | Thumbnail proxy lacks timeout, response-size limit, and provider content-type/signature validation | 9/10 |
| 3 | 🟡 MEDIUM | `backend/src/scripts/reportResourceDeliveryModes.ts`; `backend/src/config/db.ts` | report script 6-28; db 6-18 | Read-only inventory script can connect to any database selected by `MONGO_URI`/`MONGODB_URI`, including an unintended production target | 9/10 |
| 4 | 🟡 MEDIUM | `backend/src/scripts/reportResourceDeliveryModes.ts` | 12-24 | Inventory does not detect inconsistent delivery metadata, such as authenticated PDFs marked as `raw` | 8/10 |

### Audit evidence

Cloudinary SDK versions are `cloudinary@1.41.3` and `multer-storage-cloudinary@4.0.0`. The installed `private_download_url()` implementation generates a signed API download URL with authenticated type, resource type, attachment, expiry, and API signature. The thumbnail helper generates an authenticated signed image URL with `c_fill`, `f_jpg`, `h_300`, `pg_1`, and `w_400`.

The thumbnail proxy checks HTTP status but does not enforce a timeout, response-size limit, actual provider content type, or JPEG signature before returning `image/jpeg`. Tests are mocked and do not establish real Cloudinary compatibility, authentication, transformation output, or page rendering.

The inventory script performs only read queries and writes no database changes, but it uses the unrestricted environment-selected MongoDB URI from `config/db.ts`. It was not executed.

### Required corrections

1. Migrate legacy assets to authenticated delivery and invalidate former public URLs; until then, keep legacy file access unavailable.
2. Add bounded timeout, response-size enforcement, content-type validation, and image-signature validation to thumbnail proxying.
3. Add an explicit safe-target safeguard to the inventory script.
4. Validate delivery-mode/resource-type combinations in the inventory report.
5. Add real staging-provider verification for authenticated downloads, PDF transformations, thumbnails, expiry, and invalidation.

### Verification status

- No Cloudinary API calls were made.
- No database connections were made.
- No production, Atlas, development, or existing assets were accessed or modified.
- Mocked resource-file tests passed; no real-provider tests exist.
- Frontend `NoteCard` was inspected but has no dedicated thumbnail regression test.
