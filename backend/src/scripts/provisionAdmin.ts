import readline from "readline";
import mongoose, { ClientSession, Connection, Model } from "mongoose";
import dotenv from "dotenv";
import User, { IUser } from "../models/User";
import AuthSession from "../models/AuthSession";
import AdminProvisioningLock from "../models/AdminProvisioningLock";

const ADMIN_PROVISIONING_LOCK_ID = "first-admin";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPECTED_ENVIRONMENT_VARIABLE = "PROVISIONING_EXPECTED_ENVIRONMENT";
const EXPECTED_DATABASE_VARIABLE = "PROVISIONING_EXPECTED_DATABASE";

export class ProvisioningError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "ProvisioningError";
    this.code = code;
  }
}

export type ProvisioningDependencies = {
  userModel: Pick<Model<IUser>, "countDocuments" | "findOneAndUpdate">;
  authSessionModel: Pick<typeof AuthSession, "updateMany">;
  lockModel: Pick<typeof AdminProvisioningLock, "create">;
  runTransaction: <T>(
    operation: (session: ClientSession) => Promise<T>
  ) => Promise<T>;
};

export type ProvisioningIdentity = {
  environment: string;
  database: string;
  topology: "replica-set" | "sharded-cluster";
};

export type ProvisioningTarget = {
  id: IUser["_id"];
  name: string;
  email: string;
};

const defaultDependencies: ProvisioningDependencies = {
  userModel: User,
  authSessionModel: AuthSession,
  lockModel: AdminProvisioningLock,
  runTransaction: async <T>(
    operation: (session: ClientSession) => Promise<T>
  ): Promise<T> => {
    const session = await mongoose.startSession();
    try {
      let result: T;
      await session.withTransaction(async () => {
        result = await operation(session);
      });
      return result!;
    } finally {
      await session.endSession();
    }
  },
};

export const normalizeEmail = (value: string): string =>
  value.trim().toLowerCase();

export const validateEmail = (value: string): string => {
  const email = normalizeEmail(value);

  if (!EMAIL_PATTERN.test(email)) {
    throw new ProvisioningError(
      "INVALID_EMAIL",
      "Enter a valid email address."
    );
  }

  return email;
};

export const verifyProvisioningIdentity = async (
  connection: Connection,
  expectedEnvironment = process.env[EXPECTED_ENVIRONMENT_VARIABLE],
  expectedDatabase = process.env[EXPECTED_DATABASE_VARIABLE],
  actualEnvironment = process.env.NODE_ENV
): Promise<ProvisioningIdentity> => {
  const environment = expectedEnvironment?.trim();
  const database = expectedDatabase?.trim();
  const connectedEnvironment = actualEnvironment?.trim();

  if (!environment || !database || !connectedEnvironment) {
    throw new ProvisioningError(
      "IDENTITY_NOT_CONFIGURED",
      `Set NODE_ENV, ${EXPECTED_ENVIRONMENT_VARIABLE}, and ${EXPECTED_DATABASE_VARIABLE} before provisioning.`
    );
  }

  if (environment !== connectedEnvironment) {
    throw new ProvisioningError(
      "ENVIRONMENT_IDENTITY_MISMATCH",
      "The process environment does not match the expected provisioning environment."
    );
  }

  if (connection.readyState !== 1 || !connection.db || !connection.name) {
    throw new ProvisioningError(
      "DATABASE_IDENTITY_UNAVAILABLE",
      "The connected database identity could not be verified."
    );
  }

  let hello: { setName?: string; msg?: string };
  try {
    hello = await connection.db.admin().command({ hello: 1 });
  } catch {
    throw new ProvisioningError(
      "TRANSACTION_CAPABILITY_UNAVAILABLE",
      "MongoDB transaction capability could not be verified."
    );
  }

  const topology = hello.setName
    ? "replica-set"
    : hello.msg === "isdbgrid"
      ? "sharded-cluster"
      : null;

  if (!topology) {
    throw new ProvisioningError(
      "TRANSACTION_CAPABILITY_UNAVAILABLE",
      "MongoDB must use a replica set or sharded cluster for provisioning."
    );
  }

  if (connection.name !== database) {
    throw new ProvisioningError(
      "DATABASE_IDENTITY_MISMATCH",
      "The connected database does not match the expected provisioning database."
    );
  }

  return { environment: connectedEnvironment, database, topology };
};

export const provisionFirstAdmin = async (
  target: ProvisioningTarget,
  confirmed: boolean,
  dependencies: ProvisioningDependencies = defaultDependencies
): Promise<{ name: string; email: string }> => {
  const expectedEmail = validateEmail(target.email);

  if (!confirmed) {
    throw new ProvisioningError(
      "CANCELLED",
      "Administrator provisioning cancelled."
    );
  }

  return dependencies.runTransaction(async (session) => {
    try {
      await dependencies.lockModel.create(
        [{ _id: ADMIN_PROVISIONING_LOCK_ID }],
        { session }
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ProvisioningError(
          "ALREADY_INITIALIZED",
          "First-admin provisioning has already been completed."
        );
      }
      throw error;
    }

    const adminCount = await dependencies.userModel.countDocuments(
      { role: "admin" },
      { session }
    );

    if (adminCount > 0) {
      throw new ProvisioningError(
        "ADMIN_EXISTS",
        "An administrator already exists; first-admin provisioning is unavailable."
      );
    }

    const promotedUser = await dependencies.userModel.findOneAndUpdate(
      { _id: target.id, email: expectedEmail, role: "student" },
      { $set: { role: "admin" } },
      { new: true, session }
    );

    if (!promotedUser) {
      throw new ProvisioningError(
        "CONCURRENT_CHANGE",
        "The account changed during provisioning; no administrator was created."
      );
    }

    const sessionRevocation = await dependencies.authSessionModel.updateMany(
      { userId: target.id, revokedAt: null },
      {
        $set: {
          revokedAt: new Date(),
          revokedReason: "role_changed",
        },
      },
      { session }
    );

    if (sessionRevocation.acknowledged === false) {
      throw new ProvisioningError(
        "SESSION_REVOCATION_FAILED",
        "Administrator promotion was not completed because session revocation failed."
      );
    }

    return {
      name: target.name,
      email: expectedEmail,
    };
  });
};

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === 11000;

const loadTargetIdentity = async (
  email: string
): Promise<ProvisioningTarget> => {
  const target = await User.findOne(
    { email },
    { _id: 1, name: 1, email: 1 }
  );

  if (!target) {
    throw new ProvisioningError(
      "USER_NOT_FOUND",
      "No account exists for that email address."
    );
  }

  return { id: target._id, name: target.name, email: target.email };
};

const askQuestion = (
  interfaceInstance: readline.Interface,
  question: string
): Promise<string> =>
  new Promise((resolve) => {
    interfaceInstance.question(question, resolve);
  });

export const main = async (): Promise<void> => {
  const interfaceInstance = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    dotenv.config();
    const email = await askQuestion(
      interfaceInstance,
      "Administrator account email: "
    );
    const normalizedEmail = validateEmail(email);
    const { connectDB } = await import("../config/db");
    await connectDB();
    const identity = await verifyProvisioningIdentity(mongoose.connection);
    const target = await loadTargetIdentity(normalizedEmail);

    console.log(`Account name: ${target.name}`);
    console.log(`Account email: ${target.email}`);
    console.log(`Verified environment: ${identity.environment}`);
    console.log(`Verified database: ${identity.database}`);
    console.log(`Verified topology: ${identity.topology}`);

    const confirmation = await askQuestion(
      interfaceInstance,
      "Type PROMOTE to continue: "
    );

    if (confirmation.trim() !== "PROMOTE") {
      throw new ProvisioningError(
        "CANCELLED",
        "Administrator provisioning cancelled."
      );
    }

    const promotedTarget = await provisionFirstAdmin(target, true, defaultDependencies);

    console.log(
      `Administrator provisioning completed for ${promotedTarget.email}.`
    );
    console.log("Existing sessions for this account were revoked.");
    console.log("Log in again to obtain a new administrator session.");
  } catch (error) {
    if (error instanceof ProvisioningError) {
      console.error(error.message);
    } else {
      console.error("Administrator provisioning failed.");
    }
    process.exitCode = 1;
  } finally {
    interfaceInstance.close();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
};

if (require.main === module) {
  void main();
}
