import Link from "next/link";
import NoteCard from "@/components/NoteCard";
import { NotesResponse } from "@/types";
import { Filter, Upload } from "lucide-react";

interface SearchParamsType {
  semester?: string;
  subject?: string;
  topic?: string;
  page?: string;
}

interface BrowsePageProps {
  searchParams: Promise<SearchParamsType>;
}

async function getNotes(params: SearchParamsType): Promise<NotesResponse> {
  const queryParams = new URLSearchParams();

  if (params.semester) queryParams.append("semester", params.semester);
  if (params.subject) queryParams.append("subject", params.subject);
  if (params.topic) queryParams.append("topic", params.topic);
  if (params.page) queryParams.append("page", params.page);
  queryParams.append("limit", "12");

  const query = queryParams.toString();
  const url = `${process.env.NEXT_PUBLIC_API_URL}/api/notes?${query}`;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const ctrl = new AbortController();
    timeoutId = setTimeout(() => ctrl.abort(), 8000);
    const response = await fetch(url, { signal: ctrl.signal, next: { revalidate: 60 } });

    if (!response.ok) {
      throw new Error("Failed to fetch notes");
    }

    return response.json();
  } catch (error) {
    console.error("Error fetching notes:", error);
    return { notes: [], total: 0, page: 1, totalPages: 0 };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const resolvedParams = await searchParams;
  const data = await getNotes(resolvedParams);
  const currentPage = parseInt(resolvedParams.page || "1");
  const hasFilters = !!(resolvedParams.semester || resolvedParams.subject || resolvedParams.topic);

  const buildUrl = (newParams: Record<string, string | undefined>) => {
    const urlParams = new URLSearchParams();
    const merged = { ...resolvedParams, ...newParams };

    if (merged.semester) urlParams.append("semester", merged.semester);
    if (merged.subject) urlParams.append("subject", merged.subject);
    if (merged.topic) urlParams.append("topic", merged.topic);
    if (merged.page && merged.page !== "1") urlParams.append("page", merged.page);

    const query = urlParams.toString();
    return query ? `/browse?${query}` : "/browse";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Browse Notes</h1>
          <p className="text-gray-600">Explore academic notes shared by the community</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="lg:w-64 flex-shrink-0">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sticky top-24">
              <div className="flex items-center space-x-2 mb-4">
                <Filter className="h-5 w-5 text-gray-600" />
                <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
              </div>

              <form action="/browse" method="get" className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Semester</label>
                  <select
                    name="semester"
                    defaultValue={resolvedParams.semester || ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">All Semesters</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                      <option key={sem} value={sem}>Semester {sem}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
                  <input
                    type="text"
                    name="subject"
                    defaultValue={resolvedParams.subject || ""}
                    placeholder="e.g., Web Security"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Topic</label>
                  <input
                    type="text"
                    name="topic"
                    defaultValue={resolvedParams.topic || ""}
                    placeholder="e.g., SQL Injection"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Apply Filters
                </button>

                {hasFilters && (
                  <Link
                    href="/browse"
                    className="block w-full text-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Clear Filters
                  </Link>
                )}
              </form>
            </div>
          </aside>

          <main className="flex-1">
            <div className="mb-6">
              <p className="text-gray-600">
                Showing <span className="font-semibold text-gray-900">{data.total}</span> notes
                {hasFilters && " (filtered)"}
              </p>
            </div>

            {data.notes.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
                  {data.notes.map((note) => (
                    <NoteCard key={note._id} note={note} />
                  ))}
                </div>

                {data.totalPages > 1 && (
                  <div className="flex justify-center items-center space-x-2">
                    {currentPage > 1 && (
                      <Link
                        href={buildUrl({ page: (currentPage - 1).toString() })}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Previous
                      </Link>
                    )}

                    <div className="flex items-center space-x-2">
                      {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
                        let pageNum;
                        if (data.totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= data.totalPages - 2) {
                          pageNum = data.totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <Link
                            key={pageNum}
                            href={buildUrl({ page: pageNum.toString() })}
                            className={`px-4 py-2 rounded-lg transition-colors ${
                              pageNum === currentPage
                                ? "bg-blue-600 text-white"
                                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            {pageNum}
                          </Link>
                        );
                      })}
                    </div>

                    {currentPage < data.totalPages && (
                      <Link
                        href={buildUrl({ page: (currentPage + 1).toString() })}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Next
                      </Link>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16 bg-white rounded-lg shadow-sm border border-gray-200">
                <Upload className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No notes found</h3>
                <p className="text-gray-600 mb-6">
                  {hasFilters
                    ? "Try adjusting your filters or search criteria."
                    : "Be the first to share notes with the community!"}
                </p>
                <Link
                  href="/upload"
                  className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Upload Notes
                </Link>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
