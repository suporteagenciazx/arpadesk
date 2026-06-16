export function digitsOnly(value) {
  return (value || "").replace(/\D/g, "");
}

export function maskCnpj(value) {
  const d = digitsOnly(value).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function maskPhone(value) {
  const d = digitsOnly(value).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidCnpjMasked(value) {
  return digitsOnly(value).length === 14;
}

export function isValidPhoneMasked(value) {
  const len = digitsOnly(value).length;
  return len === 10 || len === 11;
}

export function maskMoney(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  const cents = digits.padStart(3, "0");
  const intPart = cents.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
  const decPart = cents.slice(-2);
  const intFormatted = Number(intPart).toLocaleString("pt-BR");
  return `${intFormatted},${decPart}`;
}

export function parseMoney(value) {
  if (!value) return 0;
  const normalized = String(value).replace(/\./g, "").replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

export function formatPctChange(value) {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}
