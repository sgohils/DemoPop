import type { Metadata } from "next";
import "./globals.css";
import { NavigationGuard } from "../components/NavigationGuard";
export const metadata: Metadata = {
  title: "DemoPop — One product. A whole launch.",
  description:
    "Turn your website, screenshots, and clips into branded launch videos. Create 15–60 second stories, export nine-video packages, and collect client feedback in one studio.",
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
