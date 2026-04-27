import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary — tinta negra (zinc), marca Licitum
        primary: {
          50:  "#FAFAFA",
          100: "#F4F4F5",
          200: "#E4E4E7",
          300: "#D4D4D8",
          400: "#A1A1AA",
          500: "#18181B",
          700: "#09090B",
          900: "#09090B",
          DEFAULT: "#18181B",
        },

        // Neutrales — zinc (grises puros, base de marca negra)
        neutral: {
          50:  "#FAFAFA",
          100: "#F4F4F5",
          200: "#E4E4E7",
          300: "#D4D4D8",
          400: "#A1A1AA",
          500: "#71717A",
          600: "#52525B",
          700: "#3F3F46",
          800: "#27272A",
          900: "#18181B",
          950: "#09090B",
        },
        // Acento — naranja del logo Licitum (#E85820), 5 tonos
        accent: {
          50:  "#FEF1E9",
          100: "#FDDDC8",
          500: "#E85820",
          700: "#B43E0F",
          900: "#5E2007",
          DEFAULT: "#E85820",
        },

        // Semáforo — tonos apagados, no gritan
        success: "#65A375",
        warning: "#D4A23E",
        danger:  "#C45A5A",

        // Tokens semánticos (vía CSS vars, cambian en dark mode)
        surface: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          raised:  "hsl(var(--surface-raised) / <alpha-value>)",
          sunken:  "hsl(var(--surface-sunken) / <alpha-value>)",
        },
        border: "hsl(var(--border) / <alpha-value>)",
        muted: {
          DEFAULT:    "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        foreground: "hsl(var(--foreground) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
        // Display — Bricolage Grotesque, mimica el wordmark licitum
        // (geométrica, lowercase-friendly, terminales rectos, peso confident)
        display: ["var(--font-display)", "var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-fraunces)", "ui-serif", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderColor: {
        DEFAULT: "hsl(var(--border) / <alpha-value>)",
      },
      // Sombras editoriales — dos capas (sutil + soft halo) para profundidad
      // sin "glow" exagerado. Evitan el aspecto de juguete.
      boxShadow: {
        "card": "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 4px 12px -2px rgb(0 0 0 / 0.05)",
        "card-hover": "0 1px 2px 0 rgb(0 0 0 / 0.05), 0 12px 28px -4px rgb(0 0 0 / 0.10)",
        "elev-1": "0 1px 2px 0 rgb(0 0 0 / 0.04)",
        "elev-2": "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 4px 12px -2px rgb(0 0 0 / 0.06)",
        "elev-3": "0 4px 16px -2px rgb(0 0 0 / 0.08), 0 20px 48px -8px rgb(0 0 0 / 0.12)",
        // Inset para cards sunken (dentro de hero, p.ej.)
        "inset-soft": "inset 0 1px 2px 0 rgb(0 0 0 / 0.04)",
      },
      transitionTimingFunction: {
        // iOS-like — acelera poco al inicio, frena con gracia
        "out-soft": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-ios": "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "shimmer": {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-up": "fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1) backwards",
        "slide-in-right": "slide-in-right 300ms cubic-bezier(0.16, 1, 0.3, 1) backwards",
        "shimmer": "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};
export default config;
