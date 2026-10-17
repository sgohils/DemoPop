import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "DemoPop — Make the transformation visible",
  description: "Turn your website redesign into your next client pitch.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
