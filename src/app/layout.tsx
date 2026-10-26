import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { ogImage, siteConfig } from "@/config/site";
import "./globals.css";
import "./home-v2.css";
import { Toaster } from "@/components/ui/sonner";
import { ClerkAppProvider } from "@/components/clerk/clerk-app-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: siteConfig.name, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  // Padrões de compartilhamento herdados pelas páginas públicas. A imagem (public/) tem URL absoluta resolvida por
  // `metadataBase`, ou seja, pelo domínio de siteConfig.url.
  openGraph: { type: "website", siteName: siteConfig.name, locale: "pt_BR", images: [ogImage] },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ClerkAppProvider>
      <html lang="pt-BR" className={`dark ${inter.variable}`} suppressHydrationWarning>
        <body className="min-h-screen font-sans antialiased">
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkAppProvider>
  );
}
