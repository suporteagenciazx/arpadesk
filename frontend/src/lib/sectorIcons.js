import { FinanceIcon, FolderIcon, MarketingIcon, SupportIcon } from "../components/Icons";

const SECTOR_ICON_MAP = {
  financeiro: FinanceIcon,
  marketing: MarketingIcon,
  suporte: SupportIcon,
};

export function sectorNavIcon(sectorId) {
  return SECTOR_ICON_MAP[sectorId] || FolderIcon;
}
