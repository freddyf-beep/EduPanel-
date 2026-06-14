import nextVitals from "eslint-config-next/core-web-vitals"

const eslintConfig = [
  ...nextVitals,
  {
    ignores: [
      ".next/**",
      ".claude/**",
      ".codex/**",
      ".kiro/**",
      "build/**",
      "backup_ia_antigua/**",
      "backups/**",
      "node_modules/**",
      "out/**",
      "scratch/**",
      "tmp/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      "@next/next/no-html-link-for-pages": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
]

export default eslintConfig
