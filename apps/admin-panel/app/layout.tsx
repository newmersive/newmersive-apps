import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Newmersive Admin Panel",
  description: "Panel de administración para TrueQIA y Allwain",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
