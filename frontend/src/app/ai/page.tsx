"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Brain, FileText, Loader2, MessageCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import TutorChat from "@/components/TutorChat";
import LoginRequired from "@/components/LoginRequired";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Note } from "@/types";

export default function AIPage() {
  const { user, loading: authLoading } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);

  useEffect(() => {
    if (!user) return;
    api.get<{ notes: Note[] }>("/api/notes", { params: { limit: 12 } })
      .then((response) => setNotes(response.data.notes || []))
      .catch((error) => console.error("Failed to load AI contexts:", error));
  }, [user]);

  if (authLoading) return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-sky-700" /></div>;
  if (!user) return <div className="mx-auto min-h-[70vh] max-w-3xl px-4 py-16"><LoginRequired returnTo="/ai" /></div>;
  return <div className="min-h-screen bg-[#f7f9fc]"><PageHeader eyebrow="Learning assistant" title="AI Tutor" description="Choose a resource to start a grounded academic conversation." /><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{selected ? <div className="space-y-4"><button onClick={() => setSelected(null)} className="text-sm font-semibold text-sky-700">← Choose another context</button><TutorChat note={{ _id: selected._id, title: selected.title }} /></div> : <><div className="grid gap-4 md:grid-cols-3">{notes.map((note) => <button key={note._id} onClick={() => setSelected(note)} className="text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-sky-300"><FileText className="h-5 w-5 text-sky-700" /><p className="mt-4 font-bold text-slate-950">{note.title}</p><p className="mt-1 text-sm text-slate-500">{note.subject}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky-700"><MessageCircle className="h-4 w-4" /> Ask about this note</span></button>)}</div>{notes.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><Brain className="mx-auto h-10 w-10 text-slate-400" /><h2 className="mt-4 font-bold text-slate-950">Add a note to start</h2><Link href="/upload" className="mt-5 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 font-semibold text-white">Upload a note</Link></div>}</>}</div></div>;
}
