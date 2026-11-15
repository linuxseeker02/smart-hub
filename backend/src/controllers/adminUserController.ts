import { Request, Response } from "express";
import mongoose, { ClientSession } from "mongoose";
import User, { UserRole } from "../models/User";
import AuthSession from "../models/AuthSession";
import AuditEvent from "../models/AuditEvent";
import {
  AuditServiceError,
  createAuditEvent,
} from "../services/auditService";

const userProjection = "name email role isActive createdAt updatedAt";
const validRoles = new Set<UserRole>(["student", "admin"]);
const pageLimit = 100;

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sendDatabaseError = (res: Response): void => {
  res.status(500).json({ message: "User management service unavailable" });
};

const validId = (value: string): boolean => mongoose.isValidObjectId(value);

const getRequestId = (req: Request): string | undefined => {
  const requestId = req.header("x-request-id");
  return requestId && requestId.length <= 128 ? requestId : undefined;
};

const runTransaction = async <T>(
  operation: (session: ClientSession) => Promise<T>
): Promise<T> => {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const lockActiveAdminSet = async (session: ClientSession): Promise<void> => {
  const firstAdmin = await User.findOne({
    role: "admin",
    isActive: true,
  })
    .sort({ _id: 1 })
    .select("_id updatedAt")
    .session(session);

  if (firstAdmin) {
    await User.updateOne(
      { _id: firstAdmin._id },
      { $set: { updatedAt: new Date() } },
      { session }
    );
  }
};

const auditMutation = async (
  actorUserId: string,
  action: Parameters<typeof createAuditEvent>[0]["action"],
  targetId: string,
  metadata: Record<string, unknown>,
  session: ClientSession
): Promise<void> => {
  await createAuditEvent(
    {
      actorUserId,
      action,
      targetType: "user",
      targetId,
      metadata,
      outcome: "success",
      session,
    },
    AuditEvent
  );
};

export const listUsers = async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const role = typeof req.query.role === "string" ? req.query.role : undefined;
  const isActive =
    typeof req.query.isActive === "string" ? req.query.isActive : undefined;

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > pageLimit ||
    (role !== undefined && !validRoles.has(role as UserRole)) ||
    (isActive !== undefined && !["true", "false"].includes(isActive))
  ) {
    res.status(400).json({ message: "Invalid user list query parameters" });
    return;
  }

  const filter: Record<string, unknown> = {};
  if (search) {
    const expression = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: expression }, { email: expression }];
  }
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === "true";

  try {
    const [users, total] = await Promise.all([
      User.find(filter)
        .select(userProjection)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.status(200).json({ users, page, limit, total });
  } catch {
    sendDatabaseError(res);
  }
};

export const getUser = async (req: Request, res: Response): Promise<void> => {
  if (!validId(req.params.id)) {
    res.status(400).json({ message: "Invalid user id" });
    return;
  }

  try {
    const user = await User.findById(req.params.id).select(userProjection).lean();
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    try {
      await createAuditEvent({
        actorUserId: req.user.id,
        action: "user_viewed",
        targetType: "user",
        targetId: req.params.id,
        requestId: getRequestId(req),
        outcome: "success",
      });
    } catch (error) {
      if (error instanceof AuditServiceError) {
        sendDatabaseError(res);
        return;
      }
      throw error;
    }

    res.status(200).json(user);
  } catch {
    sendDatabaseError(res);
  }
};

export const changeUserRole = async (
  req: Request,
  res: Response
): Promise<void> => {
  const targetId = req.params.id;
  const newRole = req.body?.role;
  if (!validId(targetId)) {
    res.status(400).json({ message: "Invalid user id" });
    return;
  }
  if (!validRoles.has(newRole)) {
    res.status(400).json({ message: "Invalid role" });
    return;
  }
  if (targetId === req.user.id && newRole !== "admin") {
    res.status(400).json({ message: "Administrators cannot demote themselves" });
    return;
  }

  try {
    const result = await runTransaction(async (session) => {
      await lockActiveAdminSet(session);
      const target = await User.findById(targetId)
        .select("name email role isActive")
        .session(session);
      if (!target) throw new Error("NOT_FOUND");
      if (target.role === newRole) return target;

      if (target.role === "admin" && target.isActive) {
        const activeAdmins = await User.countDocuments({
          role: "admin",
          isActive: true,
        }).session(session);
        if (activeAdmins <= 1) throw new Error("LAST_ADMIN");
      }

      const updated = await User.findOneAndUpdate(
        { _id: targetId, role: target.role, isActive: target.isActive },
        { $set: { role: newRole } },
        { new: true, session }
      ).select(userProjection);
      if (!updated) throw new Error("CONCURRENT_CHANGE");

      await AuthSession.updateMany(
        { userId: targetId, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: "role_changed" } },
        { session }
      );
      await auditMutation(
        req.user.id,
        "user_role_changed",
        targetId,
        { previousRole: target.role, newRole },
        session
      );
      return updated;
    });

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      res.status(404).json({ message: "User not found" });
    } else if (error instanceof Error && error.message === "LAST_ADMIN") {
      res.status(409).json({ message: "The last active administrator cannot be demoted" });
    } else if (error instanceof Error && error.message === "CONCURRENT_CHANGE") {
      res.status(409).json({ message: "User changed during the operation" });
    } else {
      sendDatabaseError(res);
    }
  }
};

export const changeUserStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  const targetId = req.params.id;
  const isActive = req.body?.isActive;
  if (!validId(targetId)) {
    res.status(400).json({ message: "Invalid user id" });
    return;
  }
  if (typeof isActive !== "boolean") {
    res.status(400).json({ message: "isActive must be boolean" });
    return;
  }
  if (targetId === req.user.id && !isActive) {
    res.status(400).json({ message: "Administrators cannot disable themselves" });
    return;
  }

  try {
    const result = await runTransaction(async (session) => {
      await lockActiveAdminSet(session);
      const target = await User.findById(targetId)
        .select("name email role isActive")
        .session(session);
      if (!target) throw new Error("NOT_FOUND");
      if (target.isActive === isActive) return target;

      if (target.role === "admin" && target.isActive && !isActive) {
        const activeAdmins = await User.countDocuments({
          role: "admin",
          isActive: true,
        }).session(session);
        if (activeAdmins <= 1) throw new Error("LAST_ADMIN");
      }

      const updated = await User.findOneAndUpdate(
        { _id: targetId, isActive: target.isActive, role: target.role },
        { $set: { isActive } },
        { new: true, session }
      ).select(userProjection);
      if (!updated) throw new Error("CONCURRENT_CHANGE");

      if (!isActive) {
        await AuthSession.updateMany(
          { userId: targetId, revokedAt: null },
          { $set: { revokedAt: new Date(), revokedReason: "account_disabled" } },
          { session }
        );
      }
      await auditMutation(
        req.user.id,
        "user_status_changed",
        targetId,
        { previousStatus: target.isActive, newStatus: isActive },
        session
      );
      return updated;
    });

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      res.status(404).json({ message: "User not found" });
    } else if (error instanceof Error && error.message === "LAST_ADMIN") {
      res.status(409).json({ message: "The last active administrator cannot be disabled" });
    } else if (error instanceof Error && error.message === "CONCURRENT_CHANGE") {
      res.status(409).json({ message: "User changed during the operation" });
    } else {
      sendDatabaseError(res);
    }
  }
};

export const revokeUserSessions = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!validId(req.params.id)) {
    res.status(400).json({ message: "Invalid user id" });
    return;
  }

  try {
    const result = await runTransaction(async (session) => {
      const user = await User.findById(req.params.id).select("_id").session(session);
      if (!user) throw new Error("NOT_FOUND");
      const update = await AuthSession.updateMany(
        { userId: req.params.id, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: "manual" } },
        { session }
      );
      await auditMutation(
        req.user.id,
        "user_sessions_revoked",
        req.params.id,
        { resultCount: update.modifiedCount },
        session
      );
      return update.modifiedCount;
    });
    res.status(200).json({ revokedCount: result });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      res.status(404).json({ message: "User not found" });
    } else {
      sendDatabaseError(res);
    }
  }
};
