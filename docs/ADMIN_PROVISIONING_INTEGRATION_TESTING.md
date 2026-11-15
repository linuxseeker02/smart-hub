# First-Admin Provisioning Integration Testing

This suite uses only a disposable local MongoDB replica set. It must not be pointed at Atlas, staging, production, or the normal development database.

## Environment

- Container: `smart-hub-provisioning-mongo`
- Host port: `27018`
- Replica set: `rs0`
- Database: `smart_hub_provisioning_test`
- URI: `mongodb://127.0.0.1:27018/smart_hub_provisioning_test?replicaSet=rs0&directConnection=true`

The test suite does not call `connectDB()` and does not load the project `.env`. It accepts only `PROVISIONING_TEST_MONGO_URI`, and rejects any URI that is not loopback, port `27018`, database `smart_hub_provisioning_test`, replica set `rs0`, and `directConnection=true`.

## Start the disposable replica set

From the repository root:

```bash
docker compose -f backend/docker-compose.provisioning-test.yml up -d
docker exec smart-hub-provisioning-mongo mongosh --quiet --eval \
  'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
docker exec smart-hub-provisioning-mongo mongosh --quiet --eval \
  'db.adminCommand({hello:1})'
```

The final command must report `setName: "rs0"`.

## Run the integration tests

From `backend/`:

```bash
npm run test:integration
```

The script uses the fixed disposable URI by default. To override it, provide `PROVISIONING_TEST_MONGO_URI`, but the test guard will reject non-loopback or non-dedicated values:

```bash
PROVISIONING_TEST_MONGO_URI='mongodb://127.0.0.1:27018/smart_hub_provisioning_test?replicaSet=rs0&directConnection=true' npm run test:integration
```

## Stop and remove the disposable environment

Only after testing is complete:

```bash
docker compose -f backend/docker-compose.provisioning-test.yml down -v
```

This removes the named disposable container and its volumes, not any project database.

## Coverage and limitations

The suite covers successful promotion, second-attempt rejection, concurrent attempts, rollback after session-revocation failure, changed email, deleted account, changed role, session revocation, and per-test cleanup.

These tests verify real MongoDB transactions and lock uniqueness only against the local single-node replica set. They do not validate Atlas networking, credentials, TLS, failover, sharded deployment behavior, or the interactive CLI.
