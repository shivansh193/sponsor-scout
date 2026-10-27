import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/ReportView";
import { APP_NAME } from "@/lib/examples";
import { loadReport } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const r = await loadReport((await params).id);
  const name = r ? r.input.brand?.name || r.input.brandQuery || "Your brand" : "Report";
  return { title: `${name} · ${APP_NAME}` };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const report = await loadReport((await params).id);
  if (!report) notFound();
  return <ReportView report={report} />;
}
