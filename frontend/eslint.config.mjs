import nextPlugin from "@next/eslint-plugin-next";

export default [
  nextPlugin.flatConfig.coreWebVitals,
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "public/snapshots/**",
    ],
  },
];
