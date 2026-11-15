"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, Plus, Wand2, X } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StudentProfile, Timetable, TimetableSlot } from "@/types";

type SlotInput = Omit<TimetableSlot, "_id">;
type UploadMode = "manual" | "file";

const DAYS: TimetableSlot["day"][] = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const EMPTY_SLOT: SlotInput = {
  day: "MON",
  period: 1,
  startTime: "09:00",
  endTime: "10:00",
  courseCode: "",
  courseName: "",
  faculty: "",
  room: "",
  type: "lecture",
};

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
};

const getTypeClass = (type: TimetableSlot["type"]) => {
  if (type === "lab") return "bg-green-50 border-green-200";
  if (type === "tutorial") return "bg-purple-50 border-purple-200";
  return "bg-blue-50 border-blue-200";
};

export default function TimetablePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [history, setHistory] = useState<Timetable[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadMode, setUploadMode] = useState<UploadMode>("manual");
  const [semester, setSemester] = useState<number | "">("");
  const [section, setSection] = useState("");
  const [academicSession, setAcademicSession] = useState("");
  const [slots, setSlots] = useState<SlotInput[]>([]);
  const [slotForm, setSlotForm] = useState<SlotInput>(EMPTY_SLOT);

  const [parsing, setParsing] = useState(false);
  const [parsedSlots, setParsedSlots] = useState<SlotInput[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [fileStatus, setFileStatus] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      void fetchTimetable();
    }
  }, [authLoading, user, router]);

  const fetchTimetable = async () => {
    try {
      setLoading(true);
      setError(null);
      const [timetableResponse, historyResponse, profileResponse] = await Promise.all([
        api.get<{ timetable: Timetable | null }>("/api/timetable"),
        api.get<{ timetables: Timetable[] }>("/api/timetable/history"),
        api.get<StudentProfile>("/api/profile"),
      ]);
      setTimetable(timetableResponse.data.timetable);
      setHistory(historyResponse.data.timetables || []);
      setAcademicSession(profileResponse.data.academicSession || "");
      if (timetableResponse.data.timetable) {
        setSemester(timetableResponse.data.timetable.semester ?? "");
        setSection(timetableResponse.data.timetable.section || "");
        setAcademicSession(
          timetableResponse.data.timetable.academicSession || profileResponse.data.academicSession || ""
        );
      }
    } catch (err) {
      console.error("Failed to fetch timetable:", err);
      setError("Failed to load timetable");
    } finally {
      setLoading(false);
    }
  };

  const today = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][new Date().getDay()];

  const currentPeriod = useMemo(() => {
    if (!timetable || !DAYS.includes(today as TimetableSlot["day"])) return null;

    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const todaysSlots = timetable.slots.filter((slot) => slot.day === today);

    const active = todaysSlots.find((slot) => {
      const start = toMinutes(slot.startTime);
      const end = toMinutes(slot.endTime);
      return start >= 0 && end >= 0 && minutes >= start && minutes < end;
    });

    return active?.period ?? null;
  }, [timetable, today]);

  const cellMap = useMemo(() => {
    const map = new Map<string, TimetableSlot>();
    if (!timetable) return map;
    for (const slot of timetable.slots) {
      map.set(`${slot.day}-${slot.period}`, slot);
    }
    return map;
  }, [timetable]);

  const addSlot = (event: FormEvent) => {
    event.preventDefault();
    if (!slotForm.courseName.trim()) return;
    setSlots((prev) => [...prev, { ...slotForm, courseName: slotForm.courseName.trim() }]);
    setSlotForm((prev) => ({ ...prev, courseName: "", courseCode: "", faculty: "", room: "" }));
  };

  const removeSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const saveTimetable = async (payloadSlots: SlotInput[]) => {
    if (payloadSlots.length === 0) {
      setError("Add at least one slot before saving");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await api.post("/api/timetable", {
        ...(semester ? { semester } : {}),
        academicSession,
        section,
        slots: payloadSlots,
      });
      setShowUploadModal(false);
      setParsedSlots([]);
      setSlots([]);
      await fetchTimetable();
    } catch (err) {
      console.error("Failed to save timetable:", err);
      setError("Failed to save timetable");
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async () => {
    if (!file) {
      setError("Choose a PDF or image timetable first");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setFileStatus("Uploading and extracting timetable...");
    setParsing(true);
    setError(null);
    try {
      const response = await api.post<{ slots: SlotInput[]; status: string; message?: string }>(
        "/api/timetable/upload-file",
        formData
      );
      if (!response.data.slots?.length) {
        throw new Error(response.data.message || "No timetable entries were found");
      }
      setParsedSlots(response.data.slots);
      setFileStatus("Preview ready. Review each entry before saving.");
    } catch (err: unknown) {
      console.error("Failed to upload timetable file:", err);
      const message = err && typeof err === "object" && "response" in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message || "Upload failed. Try another timetable file.");
      setFileStatus("");
    } finally {
      setParsing(false);
    }
  };

  const updateParsedSlot = <K extends keyof SlotInput>(index: number, key: K, value: SlotInput[K]) => {
    setParsedSlots((previous) => previous.map((slot, slotIndex) => slotIndex === index ? { ...slot, [key]: value } : slot));
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
      <div className="max-w-[95rem] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">{error}</div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <CalendarDays className="h-7 w-7 text-blue-600" />
              Weekly Timetable
            </h1>
            <p className="text-gray-600 mt-1">
              {timetable
                ? `${timetable.semester ? `Semester ${timetable.semester} • ` : ""}Section ${timetable.section || "-"}`
                : "No active timetable"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Upload Timetable
            </button>
          </div>
        </div>

        {history.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-950">Timetable history</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {history.map((item) => (
                <button key={item._id} type="button" onClick={() => setTimetable(item)} className="rounded-xl border border-slate-200 p-4 text-left hover:border-sky-300">
                  <p className="font-semibold text-slate-950">{item.academicSession || "Academic session not set"}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.semester ? `Semester ${item.semester}` : "Semester not set"} · {item.section || "Section not set"}</p>
                  <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${item.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{item.isActive ? "Current" : "Archived"}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm overflow-x-auto">
          {loading ? (
            <div className="h-80 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <table className="min-w-full border-separate border-spacing-2">
              <thead>
                <tr>
                  <th className="text-left text-sm font-semibold text-gray-700 px-2 py-2 w-28">Day</th>
                  {PERIODS.map((period) => (
                    <th key={period} className="text-center text-xs font-semibold text-gray-600 px-2 py-2 min-w-36">
                      <div>P{period}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day) => {
                  const isToday = day === today;
                  return (
                    <tr key={day} className={isToday ? "ring-2 ring-amber-300 rounded-xl" : ""}>
                      <td className="align-top px-2 py-2">
                        <div className={`font-bold ${isToday ? "text-amber-700" : "text-gray-800"}`}>{day}</div>
                      </td>
                      {PERIODS.map((period) => {
                        const slot = cellMap.get(`${day}-${period}`);
                        const isCurrent = isToday && currentPeriod === period;

                        if (!slot) {
                          return (
                            <td key={`${day}-${period}`} className="align-top">
                              <div className="h-28 rounded-lg border border-gray-200 bg-gray-50" />
                            </td>
                          );
                        }

                        return (
                          <td key={`${day}-${period}`} className="align-top">
                            <div
                              className={`h-28 rounded-lg border p-2 text-xs overflow-hidden ${getTypeClass(slot.type)} ${
                                isCurrent ? "animate-pulse ring-2 ring-green-400" : ""
                              }`}
                            >
                              <p className="font-semibold text-gray-900 truncate">{slot.courseName}</p>
                              <p className="text-gray-600 truncate">{slot.courseCode || "-"}</p>
                              <p className="text-gray-600 truncate">{slot.faculty || "-"}</p>
                              <p className="text-gray-500 truncate">Room {slot.room || "-"}</p>
                              <p className="text-[11px] text-gray-500 mt-1">
                                {slot.startTime} - {slot.endTime}
                              </p>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-white rounded-xl border border-gray-200 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Upload Timetable</h2>
              <button onClick={() => setShowUploadModal(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Academic session</span>
                  <input value={academicSession} onChange={(e) => setAcademicSession(e.target.value)} placeholder="e.g. 2026–27" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Semester</span>
                  <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value ? Number(e.target.value) : "")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </label>

                <div className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Mode</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setUploadMode("manual")}
                      className={`px-3 py-2 rounded-lg border ${
                        uploadMode === "manual" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300"
                      }`}
                    >
                      Manual entry
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode("file")}
                      className={`px-3 py-2 rounded-lg border flex items-center gap-2 ${
                        uploadMode === "file" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300"
                      }`}
                    >
                      <Wand2 className="h-4 w-4" />
                      Upload File
                    </button>
                  </div>
                </div>
              </div>

              {uploadMode === "manual" && (
                <div className="space-y-4">
                  <form onSubmit={addSlot} className="grid grid-cols-1 md:grid-cols-5 gap-3 border border-gray-200 rounded-lg p-4">
                    <select
                      value={slotForm.day}
                      onChange={(e) => setSlotForm((prev) => ({ ...prev, day: e.target.value as TimetableSlot["day"] }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      {DAYS.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min={1}
                      max={11}
                      value={slotForm.period}
                      onChange={(e) => setSlotForm((prev) => ({ ...prev, period: Number(e.target.value) }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Period"
                    />
                    <input
                      value={slotForm.startTime}
                      onChange={(e) => setSlotForm((prev) => ({ ...prev, startTime: e.target.value }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Start (HH:MM)"
                    />
                    <input
                      value={slotForm.endTime}
                      onChange={(e) => setSlotForm((prev) => ({ ...prev, endTime: e.target.value }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="End (HH:MM)"
                    />
                    <select
                      value={slotForm.type}
                      onChange={(e) =>
                        setSlotForm((prev) => ({ ...prev, type: e.target.value as TimetableSlot["type"] }))
                      }
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="lecture">lecture</option>
                      <option value="lab">lab</option>
                      <option value="tutorial">tutorial</option>
                    </select>

                    <input
                      value={slotForm.courseCode}
                      onChange={(e) => setSlotForm((prev) => ({ ...prev, courseCode: e.target.value }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg md:col-span-1"
                      placeholder="Course code"
                    />
                    <input
                      value={slotForm.courseName}
                      onChange={(e) => setSlotForm((prev) => ({ ...prev, courseName: e.target.value }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg md:col-span-2"
                      placeholder="Course name"
                    />
                    <input
                      value={slotForm.faculty}
                      onChange={(e) => setSlotForm((prev) => ({ ...prev, faculty: e.target.value }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg md:col-span-1"
                      placeholder="Faculty"
                    />
                    <input
                      value={slotForm.room}
                      onChange={(e) => setSlotForm((prev) => ({ ...prev, room: e.target.value }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg md:col-span-1"
                      placeholder="Room"
                    />
                    <button
                      type="submit"
                      className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 md:col-span-5"
                    >
                      Add Slot
                    </button>
                  </form>

                  <div className="border border-gray-200 rounded-lg divide-y">
                    {slots.length === 0 ? (
                      <p className="p-4 text-sm text-gray-500">No slots added yet.</p>
                    ) : (
                      slots.map((slot, index) => (
                        <div key={`${slot.day}-${slot.period}-${index}`} className="p-3 flex items-center justify-between gap-3">
                          <div className="text-sm">
                            <p className="font-semibold text-gray-900">
                              {slot.day} P{slot.period} • {slot.courseName}
                            </p>
                            <p className="text-gray-600">
                              {slot.startTime}-{slot.endTime} • {slot.courseCode || "-"} • {slot.faculty || "-"} • Room {slot.room || "-"} • {slot.type}
                            </p>
                          </div>
                          <button onClick={() => removeSlot(index)} className="px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <button
                    onClick={() => void saveTimetable(slots)}
                    disabled={saving}
                    className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Save Timetable"}
                  </button>
                </div>
              )}

              {uploadMode === "file" && (
                <div className="space-y-4">
                  <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-sky-300 bg-sky-50 p-6 text-center">
                    <span className="font-semibold text-slate-900">{file ? file.name : "Drag and drop or browse your timetable"}</span>
                    <span className="mt-1 text-sm text-slate-600">PDF, PNG, JPG, JPEG · maximum 10MB</span>
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  </label>
                  <button onClick={() => void uploadFile()} disabled={!file || parsing} className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60 inline-flex items-center gap-2">
                    {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    {fileStatus || "Upload and prepare preview"}
                  </button>
                  {fileStatus && <p className="text-sm text-slate-600">{fileStatus}</p>}
                </div>
              )}

              {parsedSlots.length > 0 && uploadMode === "file" && (
                <div className="border border-gray-200 rounded-lg">
                  <div className="p-3 border-b border-gray-200 font-semibold text-gray-900">Timetable preview · {parsedSlots.length} entries</div>
                  <div className="max-h-96 overflow-y-auto divide-y">
                    {parsedSlots.map((slot, index) => (
                      <div key={`${slot.day}-${slot.period}-${index}`} className="grid gap-2 p-3 md:grid-cols-8">
                        <select value={slot.day} onChange={(e) => updateParsedSlot(index, "day", e.target.value as SlotInput["day"])} className="rounded border border-gray-300 px-2 py-1 text-sm">{DAYS.map((day) => <option key={day}>{day}</option>)}</select>
                        <input value={slot.startTime} onChange={(e) => updateParsedSlot(index, "startTime", e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" aria-label="Start time" />
                        <input value={slot.endTime} onChange={(e) => updateParsedSlot(index, "endTime", e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" aria-label="End time" />
                        <input value={slot.courseCode} onChange={(e) => updateParsedSlot(index, "courseCode", e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" placeholder="Code" />
                        <input value={slot.courseName} onChange={(e) => updateParsedSlot(index, "courseName", e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm md:col-span-2" placeholder="Course" />
                        <input value={slot.faculty} onChange={(e) => updateParsedSlot(index, "faculty", e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" placeholder="Faculty" />
                        <div className="flex gap-2"><input value={slot.room} onChange={(e) => updateParsedSlot(index, "room", e.target.value)} className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm" placeholder="Room" /><button type="button" onClick={() => setParsedSlots((previous) => previous.filter((_, slotIndex) => slotIndex !== index))} className="rounded border border-red-200 px-2 text-red-600">×</button></div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 border-t border-gray-200"><button onClick={() => void saveTimetable(parsedSlots)} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">{saving ? "Saving..." : "Confirm & Save Timetable"}</button></div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
