import type { Metadata } from "next";
import { Bricolage_Grotesque, Fraunces, Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/layout/Shell";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Display font — geometric grotesque que mimica la energía del wordmark
// "licitum": lowercase, terminales rectos, peso confident. Para hero
// numbers, titulares grandes y eyebrows con peso.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "Licitum",
  description: "Licitación pública automatizada para PYMES de construcción",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${bricolage.variable} ${fraunces.variable}`}
    >
      <body className="font-sans antialiased">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
