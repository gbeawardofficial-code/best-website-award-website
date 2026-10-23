import { claimContent } from '../../data/claim';
import assets from '../../data/badge-assets-2026.json';
import type { WinnerBadge, WinnerResources, WinnerResourceRecord, BadgeSize } from '../claim/types';

export interface ClaimContentCopy {
  seo: { title: string; description: string };
  headerLabel: string;
  lookupTitle: string;
  lookupSummary: string;
  websiteLabel: string;
  websiteHelp: string;
  lookupAction: string;
  lookupBusy: string;
  winnerTitle: string;
  winnerSummary: string;
  changeWebsite: string;
  roleLegend: string;
  businessLabel: string;
  developerLabel: string;
  downloadAction: string;
  modalTitle: string;
  closeLabel: string;
  sizeLabel: string;
  sizeNames: Record<BadgeSize, string>;
  formatLabel: string;
  usageNote: string;
  notFoundTitle: string;
  notFoundMessage: string;
  retryAction: string;
  helpText: string;
  supportEmail: string;
  supportWhatsApp: string;
  supportWhatsAppLabel: string;
  noScriptMessage: string;
  footerLabel: string;
}
const assetIndex = assets.winners as Record<string, WinnerResources>;

export async function getClaimContent() {
  return { ...claimContent, variants: assetIndex['accronautobot.com'].roles[0].badges };
}

// Database approval AND matching exported artwork are required. A new DB row,
// stale title or edited developer name cannot silently issue the wrong badge.
export function resourcesForWinner(
  record: WinnerResourceRecord | undefined
): WinnerResources | undefined {
  if (!record || !record.active || record.programme_year !== 2026) return undefined;
  const entry = assetIndex[record.website_host];
  if (!entry) return undefined;
  if (
    entry.award !== record.award_title ||
    entry.websiteUrl !== record.website_url ||
    (entry.developer || null) !== record.developer_name
  )
    throw new Error('Winner artwork does not match the approved record.');
  return entry;
}

export type { WinnerBadge };
