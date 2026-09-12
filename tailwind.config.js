/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./App.tsx",
    "./index.tsx",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
    "./utils/**/*.{ts,tsx}",
    "./constants/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        /** Corpo da UI — SF Pro Text (fallback sistema / Segoe fora da Apple). */
        sans: [
          '"SF Pro Text"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        /** Títulos (h1–h4 / font-display) — SF Pro Display. */
        display: [
          '"SF Pro Display"',
          '"SF Pro Text"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        /**
         * Nomes de veículo nos cards — stack anterior (não migrar para SF Pro nomeado).
         * Mantém a aparência atual; `font-vehicle` sobrescreve Display em <h3> dos cards.
         */
        vehicle: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        plate: ['"Barlow Condensed"', '"Arial Narrow"', "Arial", "sans-serif"],
      },
      colors: {
        brand: {
          yellow: "rgb(var(--app-accent-rgb) / <alpha-value>)",
          dark: "#0A0A0A",
          surface: "#121212",
          surfaceHighlight: "#1C1C1E",
          border: "#2C2C2E",
        },
        light: {
          page: "#f2f2f7",
          card: "#e8e8ed",
          elevated: "#ffffff",
          border: "#d1d1d6",
        },
      },
    },
  },
  plugins: [],
};
