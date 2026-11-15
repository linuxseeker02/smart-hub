import { redirect } from "next/navigation";

export default async function QuizDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/note/${id}#quiz`);
}
