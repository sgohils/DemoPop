import { ReviewPage } from "../../../components/ReviewPage";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Video review",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ReviewPage token={token} />;
}
