import type { Metadata } from "next";
import "./globals.css";
import { NavigationGuard } from "../components/NavigationGuard";
export const metadata: Metadata = {
  title: "DemoPop — Client websites. Complete launch campaigns.",
  description:
    "Turn client websites, screenshots, and clips into branded launch campaigns. Export nine-video packages, reuse your brand, and collect client approval in one studio.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavigationGuard>{children}</NavigationGuard>
      </body>
    </html>
  );
}
