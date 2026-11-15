"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Shield, UserCheck, UserX, RefreshCw } from "lucide-react";
import api from "@/lib/api";

type AdminUser = {
  _id: string;
  name: string;
  email: string;
  role: "student" | "admin";
  isActive: boolean;
  createdAt: string;
};

const buttonClass = "rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ users: AdminUser[] }>("/api/admin/users", {
        params: { search: search || undefined, role: role || undefined, isActive: status || undefined, limit: 100 },
      });
      setUsers(data.users);
    } catch (error) {
      console.error("Failed to load admin users:", error);
      setMessage("Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, [role, search, status]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const mutateUser = async (user: AdminUser, action: "role" | "status" | "sessions") => {
    setMessage(null);
    try {
      if (action === "role") {
        await api.patch(`/api/admin/users/${user._id}/role`, { role: user.role === "admin" ? "student" : "admin" });
      } else if (action === "status") {
        await api.patch(`/api/admin/users/${user._id}/status`, { isActive: !user.isActive });
      } else {
        await api.post(`/api/admin/users/${user._id}/revoke-sessions`);
      }
      setMessage("Change applied successfully.");
      await loadUsers();
    } catch (error) {
      console.error("Admin user mutation failed:", error);
      setMessage("The change could not be applied.");
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-950">User management</h2>
        <p className="mt-1 text-sm text-slate-600">Manage administrator access, account status, and active sessions.</p>
      </div>
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_auto_auto_auto]">
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" className="w-full bg-transparent py-2 text-sm outline-none" />
        </label>
        <select value={role} onChange={(event) => setRole(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">All roles</option><option value="student">Students</option><option value="admin">Admins</option>
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">All statuses</option><option value="true">Active</option><option value="false">Disabled</option>
        </select>
        <button type="button" onClick={() => void loadUsers()} className={buttonClass}><RefreshCw className="mr-1 inline h-3.5 w-3.5" />Refresh</button>
      </div>
      {message && <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">{message}</p>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">User</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Joined</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Loading users...</td></tr> : users.map((user) => (
              <tr key={user._id} className="border-b border-slate-100 last:border-0">
                <td className="px-5 py-4"><p className="font-semibold text-slate-900">{user.name}</p><p className="text-xs text-slate-500">{user.email}</p></td>
                <td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{user.role}</span></td>
                <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{user.isActive ? "Active" : "Disabled"}</span></td>
                <td className="px-5 py-4 text-slate-500">{new Date(user.createdAt).toLocaleDateString()}</td>
                <td className="px-5 py-4"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void mutateUser(user, "role")} className={buttonClass}><Shield className="mr-1 inline h-3.5 w-3.5" />{user.role === "admin" ? "Make student" : "Make admin"}</button><button type="button" onClick={() => void mutateUser(user, "status")} className={buttonClass}>{user.isActive ? <><UserX className="mr-1 inline h-3.5 w-3.5" />Disable</> : <><UserCheck className="mr-1 inline h-3.5 w-3.5" />Enable</>}</button><button type="button" onClick={() => void mutateUser(user, "sessions")} className={buttonClass}>Revoke sessions</button></div></td>
              </tr>
            ))}
            {!loading && users.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No users match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
