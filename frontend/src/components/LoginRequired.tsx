"use client";

import Link from "next/link";

interface LoginRequiredProps {
  returnTo?: string;
  compact?: boolean;
}

export default function LoginRequired({
  returnTo = "/browse",
  compact = false,
}: LoginRequiredProps) {
  const encodedReturnTo = encodeURIComponent(returnTo);

  return (
    <div className={`rounded-xl border border-blue-200 bg-blue-50 text-center ${compact ? "p-5" : "p-8"}`}>
      <h2 className="text-xl font-bold text-gray-900">Login Required</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-700">
        Sign in to access academic resources, read PDFs, download study materials and use AI learning features.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link
          href={`/login?returnTo=${encodedReturnTo}`}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Login
        </Link>
        <Link
          href={`/register?returnTo=${encodedReturnTo}`}
          className="rounded-lg border border-blue-300 bg-white px-4 py-2 font-medium text-blue-700 hover:bg-blue-50"
        >
          Register
        </Link>
        <Link
          href="/browse"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
        >
          Return to Browse
        </Link>
      </div>
    </div>
  );
}
