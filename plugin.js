import { eslintCompatPlugin } from "@oxlint/plugins";
import { rules } from "./rules/index.js";

export default eslintCompatPlugin({
  meta: {
    name: "effect",
  },
  rules,
});
