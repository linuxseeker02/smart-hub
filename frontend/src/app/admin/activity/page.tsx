"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import api from "@/lib/api";

type AuditEvent = {
  _id: string;
  action: string;
  targetType: string;
  targetId?: string;
  timestamp: string;
  outcome: string;
  metadata?: Record<string, unknown>;
  actorUserId?: { name?: string; email?: string } | string;
};

export default function AdminActivityPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ events: AuditEvent[] }>("/api/admin/audit", { params: { limit: 100 } });
      setEvents(data.events);
    } catch (error) {
      console.error("Failed to load audit activity:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-2xl font-bold text-slate-950">Platform activity</h2><p className="mt-1 text-sm text-slate-600">Recent administrative actions and moderation events.</p></div>
        <button type="button" onClick={() => void loadEvents()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-300 hover:text-sky-700"><RefreshCw className="mr-1 inline h-3.5 w-3.5" />Refresh</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Action</th><th className="px-5 py-3">Actor</th><th className="px-5 py-3">Target</th><th className="px-5 py-3">When</th><th className="px-5 py-3">Metadata</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Loading activity...</td></tr> : events.map((event) => {
              const actor = typeof event.actorUserId === "object" ? event.actorUserId?.name || event.actorUserId?.email : "Unknown actor";
              return <tr key={event._id} className="border-b border-slate-100 align-top last:border-0"><td className="px-5 py-4"><div className="flex items-center gap-2 font-semibold text-slate-900"><Activity className="h-4 w-4 text-sky-700" />{event.action}</div><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${event.outcome === "success" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{event.outcome}</span></td><td className="px-5 py-4 text-slate-700">{actor}</td><td className="px-5 py-4 text-slate-600">{event.targetType}{event.targetId ? ` · ${event.targetId}` : ""}</td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{new Date(event.timestamp).toLocaleString()}</td><td className="max-w-sm px-5 py-4 text-xs text-slate-500"><pre className="whitespace-pre-wrap break-words font-sans">{event.metadata ? JSON.stringify(event.metadata, null, 2) : "—"}</pre></td></tr>;
            })}
            {!loading && events.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No activity recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
