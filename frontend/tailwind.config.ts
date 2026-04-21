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
        // Acento — ámbar (#F59E0B), 5 tonos
          accent: {
            50:  "#FFFBEB",
            100: "#FEF3C7",
            500: "#F59E0B",
            700: "#B45309",
            900: "#78350F",
            DEFAULT: "#F59E0B",
          },

        // Semáforo de solvencia — colores fijos de producto
        success: "#16A34A",
        warning: "#EA580C",
        danger:  "#DC2626",

        // Tokens semánticos (resuelven vía CSS vars, cambian en dark mode)
        surface: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          raised:  "hsl(var(--surface-raised) / <alpha-value>)",
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
        serif: ["var(--font-fraunces)", "ui-serif", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderColor: {
        DEFAULT: "hsl(var(--border) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
export default config;
