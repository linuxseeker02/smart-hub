"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StudentProfile } from "@/types";

type ProfileForm = {
  fullName: string;
  rollNumber: string;
  department: string;
  program: string;
  semester: number | "";
  academicSession: string;
  section: string;
  batch: string;
  university: string;
  phone: string;
  photoUrl: string;
  studyStreak: number;
  lastStudyDate: string | null;
};

const defaultForm: ProfileForm = {
  fullName: "",
  rollNumber: "",
  department: "",
  program: "",
  semester: "",
  academicSession: "",
  section: "",
  batch: "",
  university: "",
  phone: "",
  photoUrl: "",
  studyStreak: 0,
  lastStudyDate: null,
};

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [form, setForm] = useState<ProfileForm>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      void fetchProfile();
    }
  }, [authLoading, user, router]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<StudentProfile>("/api/profile");
      const data = response.data;
      setForm({
        fullName: data.fullName ?? "",
        rollNumber: data.rollNumber ?? "",
        department: data.department ?? "",
        program: data.program ?? "",
        semester: data.semester ?? "",
        academicSession: data.academicSession ?? "",
        section: data.section ?? "",
        batch: data.batch ?? "",
        university: data.university ?? "",
        phone: data.phone ?? "",
        photoUrl: data.photoUrl ?? "",
        studyStreak: Number(data.studyStreak ?? 0),
        lastStudyDate: data.lastStudyDate ?? null,
      });
    } catch (err) {
      console.error("Failed to fetch profile:", err);
      setError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const initials = useMemo(() => {
    const name = form.fullName.trim() || user?.name || "Student";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }, [form.fullName, user?.name]);

  const handleChange = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await api.put("/api/profile", form);
      setSuccessToast("Profile saved successfully");
      window.setTimeout(() => setSuccessToast(null), 2500);
      await fetchProfile();
    } catch (err) {
      console.error("Failed to save profile:", err);
      setError("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {successToast && (
          <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg bg-green-600 text-white shadow-lg">
            {successToast}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold">
                {initials || "S"}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{form.fullName || user.name}</h1>
                <p className="text-sm text-gray-600">
                  {form.rollNumber || "Roll number not set"} • {form.program || "Program not set"}
                </p>
                <p className="text-sm text-gray-600">{form.department || "Department not set"}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">
                Semester {form.semester}
              </span>
              <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-sm font-medium">
                Section {form.section || "-"}
              </span>
              <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-sm font-medium">
                Batch {form.batch || "-"}
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
              <p className="text-gray-500">University</p>
              <p className="font-semibold text-gray-900">{form.university || "Not set"}</p>
            </div>
            <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
              <p className="text-gray-500">Study streak</p>
              <p className="font-semibold text-gray-900">🔥 {form.studyStreak} day streak</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Edit Profile</h2>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          </div>

          {loading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Full Name</span>
                <input
                  value={form.fullName}
                  onChange={(e) => handleChange("fullName", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Roll Number</span>
                <input
                  value={form.rollNumber}
                  onChange={(e) => handleChange("rollNumber", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Department</span>
                <input
                  value={form.department}
                  onChange={(e) => handleChange("department", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Program</span>
                <input
                  value={form.program}
                  onChange={(e) => handleChange("program", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Academic Session</span>
                <input
                  value={form.academicSession}
                  onChange={(e) => handleChange("academicSession", e.target.value)}
                  placeholder="e.g. 2026–27"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Semester</span>
                <select
                  value={form.semester}
                  onChange={(e) => handleChange("semester", e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Not set</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                    <option key={sem} value={sem}>
                      {sem}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Section</span>
                <input
                  value={form.section}
                  onChange={(e) => handleChange("section", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Batch</span>
                <input
                  value={form.batch}
                  onChange={(e) => handleChange("batch", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">University</span>
                <input
                  value={form.university}
                  onChange={(e) => handleChange("university", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Phone</span>
                <input
                  value={form.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Photo URL</span>
                <input
                  value={form.photoUrl}
                  onChange={(e) => handleChange("photoUrl", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Study Streak (days)</span>
                <input
                  type="number"
                  min={0}
                  value={form.studyStreak}
                  onChange={(e) => handleChange("studyStreak", Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
