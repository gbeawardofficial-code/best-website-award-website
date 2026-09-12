import ukqabBadge from '../assets/recognition/ukqab-quality-approved-badge.png';
import type { FooterBadgeContent } from '../lib/content/types';

// Official product artwork, copied without modification on 2026-09-13:
// https://www.gstatic.com/pagespeed/insights/ui/logo/favicon_48.png
// https://www.gstatic.com/analytics-suite/header/suite/v2/ic_analytics.svg
// These identify website tools, not certification, endorsement or a fixed score.
export const footerBadgeContent = {
  quality: {
    image: { src: ukqabBadge, alt: 'UKQAB Quality Approved badge' }
  },
  tools: [
    {
      image: {
        src: '/images/services/google-pagespeed-insights.png',
        alt: 'Google PageSpeed Insights logo',
        width: 48,
        height: 48
      },
      label: 'PageSpeed Insights',
      description: 'Website performance'
    },
    {
      image: {
        src: '/images/services/google-analytics.svg',
        alt: 'Google Analytics logo',
        width: 48,
        height: 48
      },
      label: 'Google Analytics',
      description: 'Consent-based analytics'
    }
  ]
} satisfies FooterBadgeContent;
