import type { Metadata } from "next";
import "./globals.css";
import { NavigationGuard } from "../components/NavigationGuard";
export const metadata: Metadata = {
  title: "DemoPop — Client websites. Complete launch campaigns.",
  description:
    "Turn websites, screenshots, and clips into branded launch videos. Start with two free MP4 exports each month, or upgrade for nine-video campaigns.",
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
