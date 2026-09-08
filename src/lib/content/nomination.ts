import { nominationContent } from '../../data/nomination';

export interface NominationContent {
  title: string;
  fee: string;
  feeLabel: string;
  introduction: string;
  benefits: readonly string[];
  disclosure: string;
  cardLabel: string;
  security: string;
  successTitle: string;
  successMessage: string;
}

export const getNominationContent = async (): Promise<NominationContent> => nominationContent;
