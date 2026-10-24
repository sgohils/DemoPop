import type { Metadata } from "next";
import { CreateFromLink } from "../../components/CreateFromLink";
import { cloudConfigured } from "../../server/supabase";
import { billingEnabled } from "../../server/stripe";

export const metadata: Metadata = {
  title: "Create from link — DemoPop",
  description:
    "Paste your website link. DemoPop captures your product, builds a branded story, and generates a complete launch video.",
};

export default function Page() {
  return (
    <CreateFromLink
      configured={cloudConfigured()}
      billingRequired={billingEnabled()}
    />
  );
}
