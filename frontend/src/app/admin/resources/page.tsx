"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, RefreshCw, Search } from "lucide-react";
import api from "@/lib/api";

type ResourceStatus = "pending" | "approved" | "rejected" | "removed";
type Resource = {
  _id: string;
  title?: string;
  courseName?: string;
  courseCode?: string;
  subject?: string;
  moderationStatus?: ResourceStatus;
  createdAt: string;
  uploadedBy?: { name?: string; email?: string } | string;
};

const statuses: Array<ResourceStatus | ""> = ["", "pending", "approved", "rejected", "removed"];
const actionClass = "rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-300 hover:text-sky-700 disabled:opacity-50";

export default function AdminResourcesPage() {
  const [resources, setResources] = useState<Array<Resource & { type: "Note" | "PYQ" }>>([]);
  const [status, setStatus] = useState<ResourceStatus | "">("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadResources = useCallback(async () => {
    setLoading(true);
    try {
      const params = { status: status || undefined, search: search || undefined, limit: 100 };
      const [notesResponse, pyqsResponse] = await Promise.all([
        api.get<{ notes: Resource[] }>("/api/admin/notes", { params }),
        api.get<{ pyqs: Resource[] }>("/api/admin/pyqs", { params }),
      ]);
      setResources([
        ...notesResponse.data.notes.map((item) => ({ ...item, type: "Note" as const })),
        ...pyqsResponse.data.pyqs.map((item) => ({ ...item, type: "PYQ" as const })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (error) {
      console.error("Failed to load moderation queue:", error);
      setMessage("Unable to load moderation resources.");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => { void loadResources(); }, [loadResources]);

  const moderate = async (resource: Resource & { type: "Note" | "PYQ" }, nextStatus: ResourceStatus) => {
    const reason = nextStatus === "rejected" || nextStatus === "removed"
      ? window.prompt(`Reason for ${nextStatus}:`, "")
      : undefined;
    if ((nextStatus === "rejected" || nextStatus === "removed") && !reason?.trim()) return;

    const base = resource.type === "Note" ? "/api/admin/notes" : "/api/admin/pyqs";
    try {
      setMessage(null);
      if (nextStatus === "removed") {
        await api.delete(`${base}/${resource._id}`, { data: { reason: reason?.trim() } });
      } else {
        await api.patch(`${base}/${resource._id}/moderation`, { status: nextStatus, ...(reason ? { reason: reason.trim() } : {}) });
      }
      setMessage(`${resource.type} marked ${nextStatus}.`);
      await loadResources();
    } catch (error) {
      console.error("Moderation action failed:", error);
      setMessage("The moderation action could not be completed.");
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-950">Resource moderation</h2>
        <p className="mt-1 text-sm text-slate-600">Review Notes and PYQs before they appear in the public catalogue.</p>
      </div>
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_auto_auto]">
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, subject, or course" className="w-full bg-transparent py-2 text-sm outline-none" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value as ResourceStatus | "")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">{statuses.map((item) => <option key={item || "all"} value={item}>{item ? item[0].toUpperCase() + item.slice(1) : "All statuses"}</option>)}</select>
        <button type="button" onClick={() => void loadResources()} className={actionClass}><RefreshCw className="mr-1 inline h-3.5 w-3.5" />Refresh</button>
      </div>
      {message && <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">{message}</p>}
      <div className="grid gap-4">
        {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">Loading moderation queue...</div> : resources.map((resource) => {
          const label = resource.type === "Note" ? resource.title : `${resource.courseCode} · ${resource.courseName}`;
          const uploader = typeof resource.uploadedBy === "object" ? resource.uploadedBy?.name || resource.uploadedBy?.email : "Unknown uploader";
          return (
            <article key={`${resource.type}-${resource._id}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-3"><FileText className="mt-1 h-5 w-5 text-sky-700" /><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-sky-700">{resource.type}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">{resource.moderationStatus || "legacy"}</span></div><h3 className="mt-2 font-bold text-slate-950">{label}</h3><p className="mt-1 text-sm text-slate-500">{resource.subject || "Academic resource"} · Uploaded by {uploader}</p></div></div>
                <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void moderate(resource, "approved")} className={actionClass}>Approve</button><button type="button" onClick={() => void moderate(resource, "rejected")} className={actionClass}>Reject</button><button type="button" onClick={() => void moderate(resource, "removed")} className={actionClass}>Remove</button></div>
              </div>
            </article>
          );
        })}
        {!loading && resources.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">No resources match this moderation filter.</div>}
      </div>
    </section>
  );
}
