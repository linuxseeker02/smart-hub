"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import api from "@/lib/api";
import {
  Menu,
  X,
  Search,
  BookOpen,
  LogOut,
  User,
  Sun,
  Moon,
  ClipboardList,
  UserCheck,
  GraduationCap,
  FolderOpen,
  ChevronDown,
  LayoutDashboard,
  CalendarDays,
  ClipboardCheck,
  BookOpenCheck,
  Timer,
  ShieldCheck,
} from "lucide-react";

type DesktopDropdown = "academics" | "tools" | null;

export default function Navbar() {
  const { user, setUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<DesktopDropdown>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const desktopMenusRef = useRef<HTMLDivElement | null>(null);

  const academicsLinks = [
    { href: "/academics", label: "Academic profile", icon: GraduationCap },
    { href: "/academics/routine", label: "Routine", icon: CalendarDays },
    { href: "/exams", label: "Exams", icon: ClipboardCheck },
    { href: "/syllabus", label: "Syllabus", icon: BookOpenCheck },
    { href: "/grades", label: "Grades", icon: GraduationCap },
  ];

  const toolsLinks = [
    { href: "/assignments", label: "Assignments", icon: ClipboardList },
    { href: "/attendance", label: "Attendance", icon: UserCheck },
    { href: "/collections", label: "Collections", icon: FolderOpen },
    { href: "/pomodoro", label: "Pomodoro", icon: Timer },
  ];

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!desktopMenusRef.current) return;
      if (!desktopMenusRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const closeMenus = () => {
    setOpenDropdown(null);
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    setLogoutError(null);
    setLoggingOut(true);

    try {
      await api.post("/api/auth/logout");
    } catch {
      setLogoutError(
        "Logout could not be completed. Your session is still active; please try again."
      );
      setLoggingOut(false);
      return;
    }

    setUser(null);
    closeMenus();
    router.push("/");
  };

  const toggleDropdown = (menu: Exclude<DesktopDropdown, null>) => {
    setOpenDropdown((prev) => (prev === menu ? null : menu));
  };

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
      {logoutError && (
        <div
          role="alert"
          className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <span>{logoutError}</span>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="shrink-0 font-medium underline hover:no-underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loggingOut ? "Retrying..." : "Retry logout"}
            </button>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center space-x-2" onClick={closeMenus}>
            <BookOpen className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">Smart Hub</span>
          </Link>

          <div ref={desktopMenusRef} className="hidden md:flex items-center space-x-6">
            <Link
              href="/browse"
              className="text-gray-700 hover:text-blue-600 transition-colors"
              onClick={closeMenus}
            >
              Browse
            </Link>
            <Link
              href="/search"
              className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 transition-colors"
              onClick={closeMenus}
            >
              <Search className="h-4 w-4" />
              <span>Search</span>
            </Link>

            {user && (
              <>
                <Link
                  href="/dashboard"
                  className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 transition-colors"
                  onClick={closeMenus}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Dashboard</span>
                </Link>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => toggleDropdown("academics")}
                    className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 transition-colors"
                  >
                    <span>Academics</span>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  {openDropdown === "academics" && (
                    <div className="absolute mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg p-2">
                      {academicsLinks.map(({ href, label, icon: Icon }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={closeMenus}
                          className="flex items-center space-x-2 px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100"
                        >
                          <Icon className="h-4 w-4" />
                          <span>{label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => toggleDropdown("tools")}
                    className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 transition-colors"
                  >
                    <span>Tools</span>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  {openDropdown === "tools" && (
                    <div className="absolute mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg p-2">
                      {toolsLinks.map(({ href, label, icon: Icon }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={closeMenus}
                          className="flex items-center space-x-2 px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100"
                        >
                          <Icon className="h-4 w-4" />
                          <span>{label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
                {user.role === "admin" && (
                  <Link
                    href="/admin"
                    className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 transition-colors"
                    onClick={closeMenus}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>Admin</span>
                  </Link>
                )}
              </>
            )}
          </div>

          <div className="hidden md:flex items-center space-x-4">
            <button
              type="button"
              onClick={toggleTheme}
              className="relative h-10 w-10 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors flex items-center justify-center"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              <Sun
                className={`h-5 w-5 absolute transition-all duration-300 ${
                  theme === "dark"
                    ? "rotate-90 scale-0 opacity-0"
                    : "rotate-0 scale-100 opacity-100"
                }`}
              />
              <Moon
                className={`h-5 w-5 absolute transition-all duration-300 ${
                  theme === "dark"
                    ? "rotate-0 scale-100 opacity-100"
                    : "-rotate-90 scale-0 opacity-0"
                }`}
              />
            </button>

            {user ? (
              <>
                <Link
                  href="/profile"
                  className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 transition-colors"
                  onClick={closeMenus}
                >
                  <User className="h-4 w-4" />
                  <span>{user.name}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="flex items-center space-x-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>{loggingOut ? "Logging out..." : "Logout"}</span>
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                  onClick={closeMenus}
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  onClick={closeMenus}
                >
                  Register
                </Link>
              </>
            )}
          </div>

          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden p-2 rounded-lg text-gray-700 hover:bg-gray-100"
            aria-label="Toggle mobile menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <div className="px-4 py-4 space-y-3">
            <Link href="/browse" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
              Browse
            </Link>
            <Link href="/search" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
              Search
            </Link>

            {user ? (
              <>
                <Link href="/dashboard" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                  Dashboard
                </Link>
                <Link href="/academics" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                  Academics
                </Link>
                <Link href="/academics/routine" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                  Routine
                </Link>
                <Link href="/notes" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                  Notes
                </Link>
                <Link href="/ai" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                  AI Tutor
                </Link>
                <Link href="/exams" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                  Exams
                </Link>
                <Link href="/syllabus" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                  Syllabus
                </Link>
                <Link href="/grades" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                  Grades
                </Link>
                <Link href="/assignments" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                  Assignments
                </Link>
                <Link href="/attendance" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                  Attendance
                </Link>
                <Link href="/collections" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                  Collections
                </Link>
                <Link href="/pomodoro" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                  Pomodoro
                </Link>
                <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                  Profile
                </Link>
                {user.role === "admin" && (
                  <Link href="/admin" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                    Admin
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  {loggingOut ? "Logging out..." : "Logout"}
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={closeMenus}>
                  Login
                </Link>
                <Link
                  href="/register"
                  className="block px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg text-center"
                  onClick={closeMenus}
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
