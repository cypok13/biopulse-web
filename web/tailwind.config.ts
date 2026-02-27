import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        brand: {
          50: "#ecfeff", 100: "#cffafe", 200: "#a5f3fc", 300: "#67e8f9",
          400: "#22d3ee", 500: "#06b6d4", 600: "#0891b2", 700: "#0e7490",
          800: "#155e75", 900: "#164e63",
        },
        surface: {
          0: "#0b0b18",
          1: "#12121f",
          2: "#1a1a2e",
          3: "#22223a",
        },
      },
    },
  },
  plugins: [],
};
export default config;
