import { PasswordReset } from "../../../components/PasswordReset";
import { cloudConfigured } from "../../../server/supabase";
export default function Page() {
  return <PasswordReset configured={cloudConfigured()} />;
}
