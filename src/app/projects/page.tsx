import { Projects } from "../../components/Projects";
import { cloudConfigured } from "../../server/supabase";
export default function Page() {
  return <Projects configured={cloudConfigured()} />;
}
