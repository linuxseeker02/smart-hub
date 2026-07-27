"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play, RotateCcw } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StudyStats } from "@/types";

type Mode = "focus" | "short-break" | "long-break";

const DURATION_BY_MODE: Record<Mode, number> = {
  focus: 25 * 60,
  "short-break": 5 * 60,
  "long-break": 15 * 60,
};

const COLOR_BY_MODE: Record<Mode, string> = {
  focus: "#ef4444",
  "short-break": "#16a34a",
  "long-break": "#2563eb",
};

const modeLabel = (mode: Mode) => {
  if (mode === "focus") return "Focus";
  if (mode === "short-break") return "Short Break";
  return "Long Break";
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function PomodoroPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [mode, setMode] = useState<Mode>("focus");
  const [timeLeft, setTimeLeft] = useState<number>(DURATION_BY_MODE.focus);
  const [isRunning, setIsRunning] = useState(false);
  const [subject, setSubject] = useState("");
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      void fetchStats();
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!isRunning) return;

    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          void handleTimerComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRunning, mode, sessionsCompleted, subject]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        const active = document.activeElement as HTMLElement | null;
        const isTyping =
          active?.tagName === "INPUT" ||
          active?.tagName === "TEXTAREA" ||
          active?.getAttribute("contenteditable") === "true";

        if (isTyping) return;
        event.preventDefault();
        setIsRunning((prev) => !prev);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await api.get<StudyStats>("/api/study-sessions/stats");
      setTodayMinutes(response.data.todayMinutes);
      setSessionsCompleted(Math.floor(response.data.todayMinutes / 25));
    } catch (error) {
      console.error("Failed to fetch study stats:", error);
      setTodayMinutes(0);
    } finally {
      setLoading(false);
    }
  };

  const playBeep = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      osc.connect(ctx.destination);
      osc.frequency.value = 440;
      osc.start();
      window.setTimeout(() => {
        osc.stop();
        void ctx.close();
      }, 200);
    } catch (error) {
      console.error("Beep failed:", error);
    }
  };

  const logFocusSession = async () => {
    try {
      await api.post("/api/study-sessions/log", {
        subject: subject.trim() || "General",
        duration: 25,
        type: "focus",
        date: todayStr(),
      });
      setTodayMinutes((prev) => prev + 25);
    } catch (error) {
      console.error("Failed to log focus session:", error);
    }
  };

  const handleTimerComplete = async () => {
    playBeep();
    setIsRunning(false);

    if (mode === "focus") {
      await logFocusSession();
      const completed = sessionsCompleted + 1;
      setSessionsCompleted(completed);
      const nextMode: Mode = completed % 4 === 0 ? "long-break" : "short-break";
      setMode(nextMode);
      setTimeLeft(DURATION_BY_MODE[nextMode]);
      return;
    }

    setMode("focus");
    setTimeLeft(DURATION_BY_MODE.focus);
  };

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode);
    setTimeLeft(DURATION_BY_MODE[nextMode]);
    setIsRunning(false);
  };

  const resetTimer = () => {
    setTimeLeft(DURATION_BY_MODE[mode]);
    setIsRunning(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  };

  const progress = useMemo(() => {
    const total = DURATION_BY_MODE[mode];
    return ((total - timeLeft) / total) * 100;
  }, [mode, timeLeft]);

  const circleRadius = 120;
  const circumference = 2 * Math.PI * circleRadius;
  const dashOffset = circumference - (progress / 100) * circumference;

  if (authLoading || !user || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-gray-900 text-center mb-8">Pomodoro Focus Timer</h1>

          <div className="flex justify-center mb-8">
            <svg width="300" height="300" className="overflow-visible">
              <circle cx="150" cy="150" r={circleRadius} stroke="#e5e7eb" strokeWidth="12" fill="none" />
              <circle
                cx="150"
                cy="150"
                r={circleRadius}
                stroke={COLOR_BY_MODE[mode]}
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 150 150)"
              />
              <text x="150" y="145" textAnchor="middle" className="fill-gray-900 text-5xl font-bold">
                {formatTime(timeLeft)}
              </text>
              <text x="150" y="180" textAnchor="middle" className="fill-gray-600 text-lg font-medium">
                {modeLabel(mode)}
              </text>
            </svg>
          </div>

          <div className="flex justify-center gap-2 mb-6">
            {(["focus", "short-break", "long-break"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => changeMode(m)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                  mode === m
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {modeLabel(m)}
              </button>
            ))}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">What are you studying?</label>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="e.g. Threat Modelling"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-center gap-3 mb-8">
            <button
              onClick={() => setIsRunning((prev) => !prev)}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
            >
              {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isRunning ? "Pause" : "Start"}
            </button>
            <button
              onClick={resetTimer}
              className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
            <div className="p-4 rounded-lg bg-red-50 border border-red-100">
              <p className="text-sm text-red-700">🍅 {sessionsCompleted} sessions today</p>
            </div>
            <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-sm text-blue-700">{todayMinutes} minutes studied today</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
