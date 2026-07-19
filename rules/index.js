import { coreRules } from "./core.js";
import { generalRules } from "./general.js";
import { typeModelingRules } from "./type-modeling.js";
import { webRules } from "./web.js";

export const rules = {
  ...coreRules,
  ...generalRules,
  ...typeModelingRules,
  ...webRules,
};
