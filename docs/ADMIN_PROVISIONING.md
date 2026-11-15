# First Administrator Provisioning

1. Register the intended account normally through the existing registration flow.
2. Configure the expected target identity in `backend/.env`:

   ```dotenv
   NODE_ENV=development
   PROVISIONING_EXPECTED_ENVIRONMENT=development
   PROVISIONING_EXPECTED_DATABASE=smart-hub
   ```

   Use values that exactly describe the intended environment and MongoDB database name. The expected environment must match `NODE_ENV`. Configure separate values for development, staging, and production; do not copy production values into development environments.

3. Confirm that the configured MongoDB deployment is a replica set or sharded cluster. Standalone MongoDB deployments cannot run the required transaction.
4. From the `backend/` directory, run:

   ```bash
   npm run provision-admin
   ```

5. Enter the exact email address of the existing account.
6. Review the database-resolved account name and normalized email, plus the verified environment, database, and transaction-capable topology.
7. Type `PROMOTE` exactly to confirm.

The command fails closed if the expected identity is missing, does not match the active Mongoose connection, or transaction-capable topology cannot be verified. It only promotes an existing student account when no administrator exists and when first-admin provisioning has not already completed. The lock, role update, and session revocation execute in one MongoDB transaction. It revokes that account's active sessions, so the operator must log in again to obtain a new administrator session.

The command does not accept or create a password, and it must not be exposed as a public HTTP endpoint. It is intended for an operator running the backend in a controlled environment.
