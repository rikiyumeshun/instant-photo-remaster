import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#18181b",
        paper: "#fbfbfa",
        mist: "#eef5fb",
        blush: "#ffe7ee",
        accent: "#7ab7d8",
      },
      boxShadow: {
        soft: "0 18px 50px rgba(24, 24, 27, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
