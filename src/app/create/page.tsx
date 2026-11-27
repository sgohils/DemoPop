import type { Metadata } from "next";
import { CreateFromLink } from "../../components/CreateFromLink";
import { cloudConfigured } from "../../server/supabase";
import { billingEnabled } from "../../server/stripe";

export const metadata: Metadata = {
  title: "Create from a link — DemoPop",
  description:
    "Paste a public website link, review your captured screens and suggested story, then export a branded launch video.",
};

export default function Page() {
  return (
    <CreateFromLink
      configured={cloudConfigured()}
      billingRequired={billingEnabled()}
    />
  );
}
