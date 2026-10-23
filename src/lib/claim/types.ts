import type { ManagedImage } from '../content/types';

export type BadgeRole = 'business' | 'developer';
export type BadgeFormat = 'png' | 'webp';
export type BadgeSize = 'small' | 'medium' | 'large';
export type BadgeVariantId = 'A-light' | 'A-dark' | 'C-light' | 'C-dark';
export interface BadgeDownloadSize {
  id: BadgeSize;
  width: number;
  height: number;
  png: string;
  webp: string;
}
export interface WinnerBadge {
  id: BadgeVariantId;
  design: 'A' | 'C';
  name: string;
  tone: 'light' | 'dark';
  preview: ManagedImage & { src: string; width: number; height: number };
  sizes: BadgeDownloadSize[];
}
export interface WinnerResources {
  website: string;
  websiteUrl: string;
  award: string;
  developer?: string;
  roles: { id: BadgeRole; name?: string; badges: WinnerBadge[] }[];
}
export interface WinnerResourceRecord {
  programme_year: number;
  website_host: string;
  website_url: string;
  award_title: string;
  developer_name: string | null;
  active: boolean;
}
