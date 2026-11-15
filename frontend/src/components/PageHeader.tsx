import Link from "next/link";

export default function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { href: string; label: string };
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-10 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
        <div>
          {eyebrow && <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">{eyebrow}</p>}
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-slate-600">{description}</p>}
        </div>
        {action && <Link href={action.href} className="inline-flex w-fit rounded-xl bg-slate-950 px-4 py-2.5 font-semibold text-white hover:bg-sky-800">{action.label}</Link>}
      </div>
    </header>
  );
}
