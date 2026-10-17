import { Auth } from "../../components/Auth";
import { cloudConfigured } from "../../server/supabase";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string }>;
}) {
  return (
    <Auth
      configured={cloudConfigured()}
      confirmationFailed={(await searchParams).confirmation === "failed"}
    />
  );
}
