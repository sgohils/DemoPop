import { Editor } from "../../../components/Editor";
import { cloudConfigured } from "../../../server/supabase";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Editor initialId={id} configured={cloudConfigured()} />;
}
