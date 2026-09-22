import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { brand: { 50: "#eef2ff", 500: "#4f46e5", 600: "#4338ca", 700: "#3730a3" } },
    },
  },
  plugins: [],
} satisfies Config;
