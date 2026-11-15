import { Schema, model } from "mongoose";

export interface IAdminProvisioningLock {
  _id: string;
  createdAt: Date;
}

const adminProvisioningLockSchema = new Schema<IAdminProvisioningLock>(
  {
    _id: {
      type: String,
      required: true,
      immutable: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

const AdminProvisioningLock = model<IAdminProvisioningLock>(
  "AdminProvisioningLock",
  adminProvisioningLockSchema
);

export default AdminProvisioningLock;
