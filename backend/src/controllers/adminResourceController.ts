import { Request, Response } from "express";
import mongoose, { ClientSession } from "mongoose";
import Note, { ModerationStatus as NoteModerationStatus } from "../models/Note";
import PYQ, { ModerationStatus as PyqModerationStatus } from "../models/PYQ";
import AuditEvent from "../models/AuditEvent";
import { createAuditEvent } from "../services/auditService";

type ModerationStatus = NoteModerationStatus | PyqModerationStatus;
const statuses = new Set<ModerationStatus>([
  "pending",
  "approved",
  "rejected",
  "removed",
]);
const limitMax = 100;
const noteProjection =
  "uploadedBy fileUrl filePublicId deliveryMode deliveryResourceType fileType originalName title summary keywords semester subject topic downloadCount aiProcessed moderationStatus moderatedBy moderatedAt moderationReason moderationHistory createdAt updatedAt";
const pyqProjection =
  "uploadedBy semester courseCode courseName year examType fileUrl filePublicId deliveryMode deliveryResourceType originalName fileSize downloadCount description moderationStatus moderatedBy moderatedAt moderationReason moderationHistory createdAt updatedAt";

const validId = (value: string): boolean => mongoose.isValidObjectId(value);
const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const parseList = (req: Request): { page: number; limit: number } | null => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > limitMax
  ) {
    return null;
  }
  return { page, limit };
};

const sendDbError = (res: Response): void => {
  res.status(500).json({ message: "Resource management service unavailable" });
};

const moderationInput = (
  req: Request
): { status: ModerationStatus; reason?: string } | null => {
  const status = req.body?.status;
  const reason = req.body?.reason;
  if (
    typeof status !== "string" ||
    !statuses.has(status as ModerationStatus) ||
    (reason !== undefined &&
      (typeof reason !== "string" || reason.trim().length > 500))
  ) {
    return null;
  }
  const normalizedReason = typeof reason === "string" ? reason.trim() : undefined;
  if ((status === "rejected" || status === "removed") && !normalizedReason) {
    return null;
  }
  return { status: status as ModerationStatus, reason: normalizedReason };
};

const auditResourceMutation = async (
  actorUserId: string,
  action: "note_moderated" | "note_deleted" | "resource_moderated",
  targetType: "note" | "pyq",
  targetId: string,
  previousStatus: string,
  newStatus: ModerationStatus,
  reason: string | undefined,
  session: ClientSession
): Promise<void> => {
  await createAuditEvent(
    {
      actorUserId,
      action,
      targetType,
      targetId,
      metadata: {
        resourceType: targetType,
        previousStatus,
        newStatus,
        ...(reason ? { reason } : {}),
      },
      outcome: "success",
      session,
    },
    AuditEvent
  );
};

export const listAdminNotes = async (req: Request, res: Response): Promise<void> => {
  const pagination = parseList(req);
  if (!pagination) {
    res.status(400).json({ message: "Invalid pagination parameters" });
    return;
  }

  const { page, limit } = pagination;
  const filter: Record<string, unknown> = {};
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const uploader =
    typeof req.query.uploader === "string" ? req.query.uploader : undefined;

  if (search) {
    const expression = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ title: expression }, { subject: expression }, { topic: expression }];
  }
  if (status !== undefined) {
    if (!statuses.has(status as ModerationStatus)) {
      res.status(400).json({ message: "Invalid moderation status" });
      return;
    }
    filter.moderationStatus = status;
  }
  if (uploader) {
    if (!validId(uploader)) {
      res.status(400).json({ message: "Invalid uploader id" });
      return;
    }
    filter.uploadedBy = uploader;
  }

  try {
    const [notes, total] = await Promise.all([
      Note.find(filter)
        .select(noteProjection)
        .populate("uploadedBy", "name email")
        .populate("moderatedBy", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Note.countDocuments(filter),
    ]);
    res.status(200).json({ notes, total, page, limit });
  } catch {
    sendDbError(res);
  }
};

export const listAdminAuditEvents = async (
  req: Request,
  res: Response
): Promise<void> => {
  const limit = Number(req.query.limit ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    res.status(400).json({ message: "Invalid audit event limit" });
    return;
  }

  try {
    const events = await AuditEvent.find({})
      .populate("actorUserId", "name email")
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    res.status(200).json({ events });
  } catch {
    sendDbError(res);
  }
};

export const getAdminNote = async (req: Request, res: Response): Promise<void> => {
  if (!validId(req.params.id)) {
    res.status(400).json({ message: "Invalid note id" });
    return;
  }
  try {
    const note = await Note.findById(req.params.id)
      .select(noteProjection)
      .populate("uploadedBy", "name email")
      .populate("moderatedBy", "name email")
      .populate("moderationHistory.moderatedBy", "name email")
      .lean();
    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }
    res.status(200).json(note);
  } catch {
    sendDbError(res);
  }
};

export const moderateAdminNote = async (
  req: Request,
  res: Response
): Promise<void> => {
  await moderateResource(req, res, "note");
};

export const removeAdminNote = async (
  req: Request,
  res: Response
): Promise<void> => {
  await moderateResource(req, res, "note", true);
};

export const listAdminPyqs = async (req: Request, res: Response): Promise<void> => {
  const pagination = parseList(req);
  if (!pagination) {
    res.status(400).json({ message: "Invalid pagination parameters" });
    return;
  }
  const { page, limit } = pagination;
  const filter: Record<string, unknown> = {};
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const uploader =
    typeof req.query.uploader === "string" ? req.query.uploader : undefined;
  if (search) {
    const expression = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ courseCode: expression }, { courseName: expression }];
  }
  if (status !== undefined) {
    if (!statuses.has(status as ModerationStatus)) {
      res.status(400).json({ message: "Invalid moderation status" });
      return;
    }
    filter.moderationStatus = status;
  }
  if (uploader) {
    if (!validId(uploader)) {
      res.status(400).json({ message: "Invalid uploader id" });
      return;
    }
    filter.uploadedBy = uploader;
  }
  try {
    const [pyqs, total] = await Promise.all([
      PYQ.find(filter)
        .select(pyqProjection)
        .populate("uploadedBy", "name email")
        .populate("moderatedBy", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PYQ.countDocuments(filter),
    ]);
    res.status(200).json({ pyqs, total, page, limit });
  } catch {
    sendDbError(res);
  }
};

export const getAdminPyq = async (req: Request, res: Response): Promise<void> => {
  if (!validId(req.params.id)) {
    res.status(400).json({ message: "Invalid PYQ id" });
    return;
  }
  try {
    const pyq = await PYQ.findById(req.params.id)
      .select(pyqProjection)
      .populate("uploadedBy", "name email")
      .populate("moderatedBy", "name email")
      .populate("moderationHistory.moderatedBy", "name email")
      .lean();
    if (!pyq) {
      res.status(404).json({ message: "PYQ not found" });
      return;
    }
    res.status(200).json(pyq);
  } catch {
    sendDbError(res);
  }
};

export const moderateAdminPyq = async (
  req: Request,
  res: Response
): Promise<void> => {
  await moderateResource(req, res, "pyq");
};

export const removeAdminPyq = async (
  req: Request,
  res: Response
): Promise<void> => {
  await moderateResource(req, res, "pyq", true);
};

const moderateResource = async (
  req: Request,
  res: Response,
  resourceType: "note" | "pyq",
  forceRemove = false
): Promise<void> => {
  if (!validId(req.params.id)) {
    res.status(400).json({ message: `Invalid ${resourceType} id` });
    return;
  }
  const input = forceRemove
    ? { status: "removed" as const, reason: req.body?.reason }
    : moderationInput(req);
  if (
    !input ||
    (forceRemove &&
      (typeof input.reason !== "string" || input.reason.trim().length === 0)) ||
    (input.reason !== undefined &&
      (typeof input.reason !== "string" || input.reason.trim().length > 500))
  ) {
    res.status(400).json({ message: "Valid moderation status and reason are required" });
    return;
  }
  try {
    const result = await runTransaction(async (session) => {
      const resource =
        resourceType === "note"
          ? await Note.findById(req.params.id).session(session)
          : await PYQ.findById(req.params.id).session(session);
      if (!resource) throw new Error("NOT_FOUND");
      const previousStatus = resource.moderationStatus ?? "legacy";
      const now = new Date();
      resource.moderationStatus = input.status;
      resource.moderatedBy = new mongoose.Types.ObjectId(req.user.id);
      resource.moderatedAt = now;
      resource.moderationReason = input.reason;
      resource.moderationHistory.push({
        status: input.status,
        moderatedBy: new mongoose.Types.ObjectId(req.user.id),
        moderatedAt: now,
        ...(input.reason ? { reason: input.reason } : {}),
      } as never);
      await resource.save({ session });
      await auditResourceMutation(
        req.user.id,
        forceRemove
          ? resourceType === "note"
            ? "note_deleted"
            : "resource_moderated"
          : resourceType === "note"
            ? "note_moderated"
            : "resource_moderated",
        resourceType,
        req.params.id,
        previousStatus,
        input.status,
        input.reason,
        session
      );
      return resource;
    });
    res.status(200).json({
      id: result._id,
      moderationStatus: result.moderationStatus,
      moderatedBy: result.moderatedBy,
      moderatedAt: result.moderatedAt,
      moderationReason: result.moderationReason,
      moderationHistory: result.moderationHistory,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      res.status(404).json({ message: `${resourceType === "note" ? "Note" : "PYQ"} not found` });
      return;
    }
    sendDbError(res);
  }
};
