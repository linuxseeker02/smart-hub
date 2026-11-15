"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  FileText,
  GraduationCap,
  Library,
  MessageCircle,
  NotebookTabs,
  Route,
  Sparkles,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Note, StudentProfile, TimetableSlot } from "@/types";

type TodayResponse = { classes: TimetableSlot[]; day: string; total: number };

const collegeImageUrl = process.env.NEXT_PUBLIC_COLLEGE_IMAGE_URL;

const features = [
  {
    title: "AI Academic Tutor",
    description: "Ask questions about your notes and subjects in a focused study conversation.",
    icon: MessageCircle,
    href: "/ai",
    color: "bg-sky-100 text-sky-700",
  },
  {
    title: "Smart Notes",
    description: "Upload and organize academic resources in one searchable library.",
    icon: NotebookTabs,
    href: "/notes",
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    title: "AI Summary",
    description: "Turn long documents into structured study material and key concepts.",
    icon: Sparkles,
    href: "/notes",
    color: "bg-violet-100 text-violet-700",
  },
  {
    title: "Practice Quiz",
    description: "Check your understanding with questions generated from your learning material.",
    icon: CheckCircle2,
    href: "/quiz",
    color: "bg-amber-100 text-amber-700",
  },
  {
    title: "Smart Routine",
    description: "Upload your actual timetable and keep today's schedule close at hand.",
    icon: CalendarDays,
    href: "/academics/routine",
    color: "bg-rose-100 text-rose-700",
  },
  {
    title: "Academic Dashboard",
    description: "See your semester, subjects, activity, and progress in one calm workspace.",
    icon: GraduationCap,
    href: "/dashboard",
    color: "bg-indigo-100 text-indigo-700",
  },
];

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const loadWorkspace = async () => {
      try {
        const [profileResponse, todayResponse, notesResponse] = await Promise.all([
          api.get<StudentProfile>("/api/profile"),
          api.get<TodayResponse>("/api/timetable/today"),
          api.get<{ notes: Note[] }>("/api/notes", { params: { limit: 3 } }),
        ]);
        setProfile(profileResponse.data);
        setToday(todayResponse.data);
        setRecentNotes(notesResponse.data.notes || []);
      } catch (error) {
        console.error("Unable to load personalized home:", error);
      }
    };

    void loadWorkspace();
  }, [user]);

  const displayName = profile?.fullName || user?.name || "";
  const isReady = !authLoading && Boolean(user);

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <main>
        <section className="relative overflow-hidden border-b border-slate-200 bg-white">
          <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-sky-100/70 blur-3xl" />
          <div className="absolute -bottom-40 left-1/3 h-96 w-96 rounded-full bg-indigo-100/60 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-24">
            <div className="flex flex-col justify-center">
              <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
                <Sparkles className="h-4 w-4" />
                Personal learning, organized
              </div>
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.22em] text-slate-500">
                Smart Hub
              </p>
              <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-950 sm:text-6xl">
                Your Personal{" "}
                <span className="text-sky-700">AI Academic Workspace</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
                Organize your notes, understand your subjects, manage your routine, and learn with an AI tutor — all in one place.
              </p>

              {isReady ? (
                <div className="mt-8 rounded-2xl border border-sky-100 bg-sky-50/80 p-5">
                  <p className="text-sm font-semibold text-sky-700">{greeting()}, {displayName}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">Continue your learning journey.</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-600">
                    {profile?.academicSession && <span className="rounded-full bg-white px-3 py-1">Session {profile.academicSession}</span>}
                    {profile?.semester ? <span className="rounded-full bg-white px-3 py-1">Semester {profile.semester}</span> : null}
                    {profile?.section && <span className="rounded-full bg-white px-3 py-1">Section {profile.section}</span>}
                  </div>
                </div>
              ) : null}

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={user ? "/dashboard" : "/register"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-sky-800">
                  {user ? "Open My Dashboard" : "Get Started"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/browse" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-700">
                  <Library className="h-4 w-4" />
                  {user ? "Explore Resources" : "Explore Smart Hub"}
                </Link>
              </div>
            </div>

            <div className="relative flex min-h-[360px] items-end overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-xl">
              {collegeImageUrl ? (
                <img src={collegeImageUrl} alt="College campus" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-[linear-gradient(135deg,#dbeafe_0%,#f8fafc_48%,#e0e7ff_100%)]">
                  <div className="absolute left-10 top-12 h-36 w-36 rounded-full border-[18px] border-white/70" />
                  <div className="absolute bottom-0 right-0 h-64 w-64 rounded-tl-full bg-sky-200/60" />
                </div>
              )}
              <div className="relative m-5 w-full rounded-2xl border border-white/60 bg-slate-950/75 p-5 text-white backdrop-blur-sm">
                <p className="text-sm font-medium text-sky-200">Built for students</p>
                <h2 className="mt-1 text-2xl font-bold">A calmer way to study.</h2>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  Your academic context connects your routine, resources, and progress so every study session starts with less friction.
                </p>
              </div>
            </div>
          </div>
        </section>

        {user && (
          <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Current academic status</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Your study day at a glance</h2>
              </div>
              <Link href="/dashboard" className="hidden text-sm font-semibold text-sky-700 sm:block">View full dashboard →</Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ["Academic session", profile?.academicSession || "Not set", Route],
                ["Semester", profile?.semester ? `Semester ${profile.semester}` : "Not set", GraduationCap],
                ["Today's classes", String(today?.total ?? 0), CalendarDays],
                ["Next class", today?.classes?.[0]?.courseName || "No class scheduled", BookOpen],
              ] as Array<[string, string, LucideIcon]>).map(([label, value, Icon]) => (
                <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <Icon className="h-5 w-5 text-sky-700" />
                  <p className="mt-5 text-sm text-slate-500">{label}</p>
                  <p className="mt-1 truncate text-lg font-bold text-slate-950">{value}</p>
                </div>
              ))}
            </div>
            {recentNotes.length > 0 && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-950">Recently added resources</h3>
                  <Link href="/browse" className="text-sm font-semibold text-sky-700">Browse all</Link>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {recentNotes.map((note) => (
                    <Link key={note._id} href={`/note/${note._id}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-sky-300 hover:bg-sky-50">
                      <FileText className="h-5 w-5 text-sky-700" />
                      <p className="mt-3 truncate font-semibold text-slate-900">{note.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{note.subject}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Everything connected</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Built around the way you actually learn</h2>
            <p className="mt-3 text-slate-600">From the first upload to the next class, Smart Hub keeps the important context close.</p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ title, description, icon: Icon, href, color }) => (
              <Link key={title} href={href} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></div>
                <h3 className="mt-5 text-lg font-bold text-slate-950">{title}</h3>
                <p className="mt-2 leading-6 text-slate-600">{description}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">Open feature <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
              </Link>
            ))}
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">How Smart Hub works</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-950">A workspace that grows with you</h2>
            </div>
            <div className="mt-10 grid gap-8 md:grid-cols-4">
              {([
                ["01", "Set up your academic profile", GraduationCap],
                ["02", "Upload notes and timetable", Upload],
                ["03", "Learn with AI", Brain],
                ["04", "Track your progress", Route],
              ] as Array<[string, string, LucideIcon]>).map(([number, title, Icon]) => (
                <div key={String(number)} className="relative text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><Icon className="h-6 w-6" /></div>
                  <p className="mt-4 text-xs font-bold tracking-widest text-slate-400">{number}</p>
                  <h3 className="mt-2 font-bold text-slate-950">{title}</h3>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-slate-950 px-4 py-10 text-slate-300">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-bold text-white"><BookOpen className="h-5 w-5 text-sky-400" /> Smart Hub</div>
          <p className="text-sm">Your Personal AI Academic Workspace</p>
        </div>
      </footer>
    </div>
  );
}
