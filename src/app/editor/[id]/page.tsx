import { Editor } from "../../../components/Editor";
import { cloudConfigured } from "../../../server/supabase";
import { templateSchema, formatSchema } from "../../../shared/project";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ template?: string; format?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <Editor
      initialId={id}
      configured={cloudConfigured()}
      initialStyle={
        id === "new"
          ? {
              template: templateSchema.safeParse(query.template).data,
              format: formatSchema.safeParse(query.format).data,
            }
          : undefined
      }
    />
  );
}
