"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, GraduationCap, Loader2, NotebookTabs, Route, Settings2, type LucideIcon } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StudentProfile, Timetable } from "@/types";

export default function AcademicsPage() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get<StudentProfile>("/api/profile"),
      api.get<{ timetable: Timetable | null }>("/api/timetable"),
    ]).then(([profileResponse, timetableResponse]) => {
      setProfile(profileResponse.data);
      setTimetable(timetableResponse.data.timetable);
    }).catch((error) => console.error("Failed to load academic context:", error))
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || !user || loading) {
    return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-sky-700" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc]">
      <PageHeader eyebrow="Academic context" title="Academics" description="Keep your profile, current session, semester, subjects, and routine connected." action={{ href: "/profile", label: "Edit academic profile" }} />
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-4 md:grid-cols-4">
          {([
            ["Program", profile?.program || "Not set", GraduationCap],
            ["College", profile?.university || "Not set", Route],
            ["Academic session", profile?.academicSession || "Not set", CalendarDays],
            ["Current semester", profile?.semester ? `Semester ${profile.semester}` : "Not set", NotebookTabs],
          ] as Array<[string, string, LucideIcon]>).map(([label, value, Icon]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Icon className="h-5 w-5 text-sky-700" />
              <p className="mt-4 text-sm text-slate-500">{label}</p>
              <p className="mt-1 font-bold text-slate-950">{value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Academic journey</p><h2 className="mt-1 text-2xl font-bold text-slate-950">Semesters</h2></div>
            <Settings2 className="h-5 w-5 text-slate-400" />
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => index + 1).map((semester) => {
              const current = profile?.semester === semester;
              return <div key={semester} className={`rounded-xl border p-4 ${current ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-slate-50"}`}><p className="text-sm text-slate-500">Semester {semester}</p><p className="mt-1 font-semibold text-slate-950">{current ? "Current semester" : "Academic record"}</p></div>;
            })}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Link href="/academics/routine" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-sky-300"><CalendarDays className="h-6 w-6 text-sky-700" /><h3 className="mt-4 font-bold text-slate-950">Routine</h3><p className="mt-1 text-sm text-slate-600">{timetable ? `${timetable.slots.length} classes in your active timetable.` : "No timetable added yet."}</p></Link>
          <Link href="/notes" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-sky-300"><NotebookTabs className="h-6 w-6 text-sky-700" /><h3 className="mt-4 font-bold text-slate-950">Notes and resources</h3><p className="mt-1 text-sm text-slate-600">Browse material connected to your learning.</p></Link>
          <Link href="/portal" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-sky-300"><GraduationCap className="h-6 w-6 text-sky-700" /><h3 className="mt-4 font-bold text-slate-950">Progress</h3><p className="mt-1 text-sm text-slate-600">Review study activity and academic signals.</p></Link>
        </section>
      </div>
    </div>
  );
}
