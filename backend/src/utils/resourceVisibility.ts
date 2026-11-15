import { FilterQuery } from "mongoose";
import { INote } from "../models/Note";
import { IPYQ } from "../models/PYQ";

export const publicModerationFilter = {
  $or: [{ moderationStatus: { $exists: false } }, { moderationStatus: "approved" }],
};

export const publicNoteFilter = (
  filter: FilterQuery<INote> = {}
): FilterQuery<INote> => ({
  $and: [filter, publicModerationFilter],
});

export const publicPyqFilter = (
  filter: FilterQuery<IPYQ> = {}
): FilterQuery<IPYQ> => ({
  $and: [filter, publicModerationFilter],
});
