import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores(["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    // eslint-config-next 16 passou a incluir regras novas do
    // eslint-plugin-react-hooks (voltadas para compatibilidade com o React
    // Compiler) que não existiam na versão anterior (14.2.35). Elas
    // sinalizam ~10 padrões pré-existentes (setState em useEffect,
    // Math.random() em useMemo) que funcionam corretamente hoje e não são
    // bugs — rebaixadas para warning em vez de reescrever esses hooks como
    // efeito colateral do upgrade de dependências desta auditoria.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
