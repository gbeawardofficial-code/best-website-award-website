import { footerBadgeContent } from '../../data/footer-badges';
import type { FooterBadgeContent } from './types';

export async function getFooterBadges(): Promise<FooterBadgeContent> {
  return footerBadgeContent;
}
