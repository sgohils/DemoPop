import { Auth } from "../../components/Auth";
import { cloudConfigured } from "../../server/supabase";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string; next?: string }>;
}) {
  const query = await searchParams;
  return (
    <Auth
      configured={cloudConfigured()}
      confirmationFailed={query.confirmation === "failed"}
      next={query.next}
    />
  );
}
