# Admin Resource Moderation

Stage 3 adds backend-only moderation APIs under `/api/admin`. Every endpoint requires a valid active session and the database-backed `admin` role.

## Endpoints

### Notes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/notes` | Paginated note review list |
| GET | `/api/admin/notes/:id` | Note details and moderation history |
| PATCH | `/api/admin/notes/:id/moderation` | Approve, reject, or remove a note |
| DELETE | `/api/admin/notes/:id` | Soft-remove a note |

### PYQs

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/pyqs` | Paginated PYQ review list |
| GET | `/api/admin/pyqs/:id` | PYQ details and moderation history |
| PATCH | `/api/admin/pyqs/:id/moderation` | Approve, reject, or remove a PYQ |
| DELETE | `/api/admin/pyqs/:id` | Soft-remove a PYQ |

List endpoints accept `page`, `limit`, `search`, `status`, and `uploader` where applicable. Searches cover note title/subject/topic and PYQ course code/name.

## Moderation workflow

New note and PYQ submissions are created as `pending`. An administrator can submit:

```json
{ "status": "approved" }
```

Rejections and removals require a non-empty reason:

```json
{ "status": "rejected", "reason": "Incomplete material" }
```

Each decision stores the authenticated administrator, timestamp, current reason, and an embedded moderation-history entry. `DELETE` is a soft removal and does not delete the Cloudinary object or database record.

## Student access

Student-facing listings, search, details, downloads, thumbnails, reviews, ratings, flashcard generation, bookmarks, collections, and tutor lookups expose only `approved` resources. Records created before moderation fields existed remain visible as legacy resources with no `moderationStatus`; they are not destructively migrated.

New PDF Note and PYQ uploads use Cloudinary `image` resources with `authenticated` delivery so approved PDF thumbnails can be transformed to JPEG. DOCX and PPT Note uploads use authenticated `raw` delivery. Student-facing upload, listing, detail, and search responses omit provider URLs, identifiers, and delivery metadata. Approved resources can obtain a Cloudinary private-download URL through the file-access endpoint; the URL is generated after a current database moderation check and expires after five minutes. Pending, rejected, removed, and unknown-delivery resources do not receive a file-access URL.

`deliveryMode` and `deliveryResourceType` explicitly identify new authenticated assets. Existing records without these fields are treated as unknown and fail closed for file and thumbnail access; they are not silently assumed to be authenticated. The inventory command requires `RESOURCE_DELIVERY_REPORT_CONFIRM=read-only` and rejects non-local MongoDB hosts before connecting:

```bash
RESOURCE_DELIVERY_REPORT_CONFIRM=read-only npm run report-resource-delivery
```

The migration command is dry-run by default and has the same localhost-only database guard. For legacy PDF resources, it verifies `resource_type=raw` and `type=upload` before changing delivery to `type=authenticated`; it preserves the public ID and invalidates the former public delivery. Applying a migration additionally requires `--apply`, `RESOURCE_DELIVERY_MIGRATION_CONFIRM=apply-local`, and `CLOUDINARY_MIGRATION_CONFIRM=apply-provider`. The apply path verifies the provider asset as a public raw resource, changes its delivery type to authenticated, verifies the authenticated raw provider state, and only then updates the matching database metadata. A failed database update triggers a provider delivery-type rollback attempt. No rejected or removed resource is migrated, and no command deletes an asset.

Atlas migration preparation uses a separate `--atlas` mode. It requires the exact target host confirmation, database confirmation `test`, and an allowlist matching the nine approved Note IDs. Dry-run:

```bash
RESOURCE_DELIVERY_ATLAS_MIGRATION_CONFIRM=prepare-atlas-test \
RESOURCE_DELIVERY_ATLAS_HOST_CONFIRM="<approved-atlas-host>" \
RESOURCE_DELIVERY_ATLAS_DATABASE_CONFIRM=test \
RESOURCE_DELIVERY_ATLAS_NOTE_ALLOWLIST="<approved-note-ids>" \
npm run migrate-resource-delivery -- --atlas
```

For raw assets whose Admin API response omits `format`, the dry-run performs a bounded read-only provider request for the first bytes and requires the PDF magic header `%PDF-`. File names and stored `fileType` values are not accepted as proof. The provider URL is held in memory only and is never printed or returned.

Apply additionally requires `--apply`, `RESOURCE_DELIVERY_ATLAS_MIGRATION_CONFIRM=apply-atlas-test`, and `CLOUDINARY_MIGRATION_CONFIRM=apply-provider`. The existing localhost mode remains unchanged.

Existing assets uploaded with the former public delivery configuration are not automatically changed, invalidated, or deleted. The migration workflow identifies each asset, converts only explicitly classified legacy-public assets to the correct authenticated resource type, sets both delivery fields after provider verification, and preserves the same public ID. Rejected and removed records remain denied and are skipped. Provider-side behavior still requires operator verification in the target Cloudinary account before any apply run.

Uploaders retain the existing ownership behavior for deleting their own submissions. Students cannot set or change moderation fields because upload and student routes use explicit field assignments and do not expose moderation mutations.

## Audit behavior

Moderation mutations run in MongoDB transactions with their audit event. Notes use `note_moderated` and `note_deleted`; PYQs use `resource_moderated`. Audit metadata contains only resource type, previous status, new status, and an optional reason. Audit persistence failure aborts the resource mutation and history update.

## Validation

Run focused resource tests against the disposable replica set:

```bash
docker compose -f backend/docker-compose.provisioning-test.yml up -d
docker exec smart-hub-provisioning-mongo mongosh --quiet --eval \
  'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
cd backend
npm test -- --run tests/admin-resource.integration.test.ts
docker compose -f docker-compose.provisioning-test.yml down -v
```

The test database is loopback-only and separate from normal development, production, and Atlas databases.

## Known limitations

- There is no admin frontend or moderation queue UI.
- Moderation history is embedded in each resource and is not independently queryable.
- Existing legacy resources remain publicly visible until an explicit migration or manual moderation decision.
- Existing public Cloudinary URLs remain usable until provider-side migration and invalidation; removing them from API responses does not revoke them.
- Thumbnail delivery requires an authenticated PDF image resource; unknown or legacy delivery modes fail closed rather than returning an unverified transformation.
