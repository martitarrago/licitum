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
        // Primary — azul Licitum (#1F4E79), 5 tonos
        primary: {
          50:  "#F0F5FA",
          100: "#D6E3EF",
          200: "#AECADF",
          300: "#7AAFC9",
          400: "#4B7FA0",
          500: "#1F4E79",
          700: "#163858",
          900: "#0A1F33",
          DEFAULT: "#1F4E79",
        },

        // Neutrales cálidos (warm grays con tinte beige, no fríos)
        neutral: {
          50:  "#FAFAF9",
          100: "#F5F5F4",
          200: "#E7E5E4",
          300: "#D6D3D1",
          400: "#A8A29E",
          500: "#78716C",
          600: "#57534E",
          700: "#44403C",
          800: "#292524",
          900: "#1C1917",
          950: "#0C0A09",
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
      },
      borderColor: {
        DEFAULT: "hsl(var(--border) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
export default config;
