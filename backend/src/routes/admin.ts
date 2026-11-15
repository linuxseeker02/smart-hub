import express from "express";
import {
  changeUserRole,
  changeUserStatus,
  getUser,
  listUsers,
  revokeUserSessions,
} from "../controllers/adminUserController";
import { protect } from "../middleware/authMiddleware";
import { requireRoles } from "../middleware/roleMiddleware";
import {
  getAdminNote,
  getAdminPyq,
  listAdminNotes,
  listAdminPyqs,
  moderateAdminNote,
  moderateAdminPyq,
  removeAdminNote,
  removeAdminPyq,
  listAdminAuditEvents,
} from "../controllers/adminResourceController";

const router = express.Router();
const adminOnly = [protect, requireRoles("admin")];

router.get("/users", ...adminOnly, listUsers);
router.get("/users/:id", ...adminOnly, getUser);
router.patch("/users/:id/role", ...adminOnly, changeUserRole);
router.patch("/users/:id/status", ...adminOnly, changeUserStatus);
router.post("/users/:id/revoke-sessions", ...adminOnly, revokeUserSessions);
router.get("/notes", ...adminOnly, listAdminNotes);
router.get("/notes/:id", ...adminOnly, getAdminNote);
router.patch("/notes/:id/moderation", ...adminOnly, moderateAdminNote);
router.delete("/notes/:id", ...adminOnly, removeAdminNote);
router.get("/pyqs", ...adminOnly, listAdminPyqs);
router.get("/pyqs/:id", ...adminOnly, getAdminPyq);
router.patch("/pyqs/:id/moderation", ...adminOnly, moderateAdminPyq);
router.delete("/pyqs/:id", ...adminOnly, removeAdminPyq);
router.get("/audit", ...adminOnly, listAdminAuditEvents);

export default router;
