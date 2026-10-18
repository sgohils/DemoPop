import type { Metadata } from "next";
import "./globals.css";
import { NavigationGuard } from "../components/NavigationGuard";
export const metadata: Metadata = {
  title: "DemoPop — Your next launch, in motion",
  description:
    "Turn two product screenshots into a bold 15-second launch film. Make it yours, preview every beat, and export a video worth showing.",
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
