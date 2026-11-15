# Admin User Management API

The administrator user-management API is mounted at `/api/admin` and is backend-only in this stage.

## Authorization

Every endpoint requires:

1. A valid access-token cookie and active `AuthSession`.
2. A database-backed `admin` role.

Unauthenticated requests receive `401`; authenticated non-admin requests receive `403`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/users` | Paginated user list |
| GET | `/api/admin/users/:id` | Safe administrative user details |
| PATCH | `/api/admin/users/:id/role` | Change `student`/`admin` role |
| PATCH | `/api/admin/users/:id/status` | Set `isActive` |
| POST | `/api/admin/users/:id/revoke-sessions` | Revoke active sessions |

### List users

```http
GET /api/admin/users?page=1&limit=20&search=alice&role=student&isActive=true
```

The response contains `users`, `page`, `limit`, and `total`. User responses include only account identity, role, status, and timestamps. Password hashes and authentication/session secrets are excluded.

### Change role

```http
PATCH /api/admin/users/<id>/role
Content-Type: application/json

{"role":"admin"}
```

Valid roles are `student` and `admin`. Administrators cannot demote themselves, and the last active administrator cannot be demoted. Successful role changes revoke the target’s active sessions with `role_changed` and create a `user_role_changed` audit event.

### Change account status

```http
PATCH /api/admin/users/<id>/status
Content-Type: application/json

{"isActive":false}
```

Administrators cannot disable themselves, and the last active administrator cannot be disabled. Disabling an account revokes active sessions with `account_disabled`; re-enabling does not alter unrelated fields.

### Revoke sessions

```http
POST /api/admin/users/<id>/revoke-sessions
```

The response contains only `revokedCount`. Session IDs, token hashes, and tokens are never returned. The operation creates a `user_sessions_revoked` audit event.

## Transactions and audit logging

Role and status changes, session revocation, and their audit event are executed in a MongoDB transaction. The implementation requires a transaction-capable MongoDB deployment such as the disposable replica set or MongoDB Atlas.

The user-detail endpoint records `user_viewed`. List operations do not record per-row events to avoid excessive audit noise. Audit persistence failures fail the operation rather than reporting a false success.

## Security restrictions

- No public role or status assignment exists.
- No private student profile or academic records are returned.
- No password, JWT, refresh token, cookie, session hash, or secret is exposed.
- Mutation payloads are explicit and do not support mass assignment.
- Existing student ownership rules remain unchanged.

## Validation

Focused integration tests use only the disposable local replica set:

```bash
docker compose -f backend/docker-compose.provisioning-test.yml up -d
docker exec smart-hub-provisioning-mongo mongosh --quiet --eval \
  'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
cd backend
npm test -- --run
docker compose -f docker-compose.provisioning-test.yml down -v
```

The integration suite validates the dedicated loopback database before connecting. Real Atlas, production, and ordinary development databases must not be used for tests.

## Known limitations

- There is no admin frontend in this stage.
- Audit events are persisted but there is no audit-event query endpoint yet.
- The last-admin serialization uses a transactional write lock on the first active admin; MongoDB transaction support is required.
