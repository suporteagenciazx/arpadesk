/** @deprecated use projectSectors.js — mantido para compatibilidade */
import { isSectorEnabled } from "./projectSectors";

export function getMarketingConfig(settings) {
  const raw = settings?.marketing_config || {};
  return {
    enabled: isSectorEnabled({ settings }, "marketing"),
    channels: Array.isArray(raw.channels) ? raw.channels : ["sms", "whatsapp"],
    expense_types_marketing: Array.isArray(raw.expense_types_marketing)
      ? raw.expense_types_marketing
      : ["DIVULGACAO"],
  };
}

export function isMarketingEnabled(project) {
  return isSectorEnabled(project, "marketing");
}
