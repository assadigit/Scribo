import type { Metadata } from "next";
import { Cormorant_Garamond, Courier_Prime, Fraunces, Inter, Kalam, Libre_Baskerville, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { FontLoader } from "@/components/font-loader";

// Vazirmatn is self-hosted via explicit @font-face rules in globals.css
// (public/fonts) — see the font stack notes there.

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const baskerville = Libre_Baskerville({
  variable: "--font-baskerville",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

/* Landing-page typography (the “Ink & Invitation” system): Fraunces is the
   Latin display face, Source Serif 4 the long-form body face, Inter the UI
   chrome face. Farsi always renders in the self-hosted Vazirmatn (each stack
   ends with it, so mixed-script strings stay whole). */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500"],
  style: ["normal"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// “Analog Dispatch” app-chrome type: Courier Prime is the typewriter face for
// UI chrome (buttons, labels, tags) in the app surfaces; Kalam is the pencil
// hand for margin annotations. Both are self-hosted at build time by
// next/font, same as the landing families above. Farsi always falls back to
// the self-hosted Vazirmatn (each stack ends with it).
const courierPrime = Courier_Prime({
  variable: "--font-courier-prime",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const kalam = Kalam({
  variable: "--font-kalam",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://scribo.ir"),
  title: "Scribo - Private Readings",
  description:
    "A quiet corner for a few trusted readers. New pages, honest notes, nothing lost in a chat thread.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Scribo - Private Readings",
    description:
      "A quiet corner for a few trusted readers. New pages, honest notes, nothing lost in a chat thread.",
    type: "website",
    images: [{ url: "/hero/og-cover.jpg" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Static-safe shell: no cookies()/db reads here, so public pages (landing,
  // About, Contact, robots) prerender at build time and are served straight
  // from the CDN. Locale/theme/calendar self-host from the cookie on the
  // client (Providers) with a pre-paint bootstrap script below; the admin-
  // uploaded custom font is fetched after hydration by FontLoader.

  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${cormorant.variable} ${baskerville.variable} ${fraunces.variable} ${sourceSerif.variable} ${inter.variable} ${courierPrime.variable} ${kalam.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=document.cookie;function get(n){var m=c.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?m[1]:null;}var theme=get('theme');if(!theme){var h=new Date().getHours();theme=(h>=21||h<7)?'dark':'light';}var locale=get('locale')==='en'?'en':'fa';var d=document.documentElement;if(theme==='dark')d.classList.add('dark');d.lang=locale;d.dir=locale==='fa'?'rtl':'ltr';}catch(e){}})();`
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        {/* Film-grain overlay — a fixed, non-interactive noise layer over the
            whole app (the trendy paper/ink grain). Multiply in light mode,
            screen in dark mode, so the speckle reads on both surfaces. */}
        <div aria-hidden="true" className="grain-overlay" />
        <FontLoader />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
