"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Activity, ShieldCheck, Users, Files } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const tabs = [
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/resources", label: "Resources", icon: Files },
  { href: "/admin/activity", label: "Activity", icon: Activity },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== "admin") {
    return <div className="flex min-h-[70vh] items-center justify-center text-sm text-slate-500">Checking administrator access...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc]">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-sky-700" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Administration</p>
              <h1 className="mt-1 text-3xl font-bold text-slate-950">Smart Hub control center</h1>
            </div>
          </div>
          <nav className="mt-6 flex flex-wrap gap-2" aria-label="Admin sections">
            {tabs.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== "/admin/users" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    active ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
