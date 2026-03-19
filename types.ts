
export interface SymbolData {
  name: string;
  img: string;
  value: number;
}

export interface Quest {
  id: string;
  name: string;
  description: string;
  currentProgress: number;
  total: number;
  reward: { type: 'points' | 'ton'; amount: number };
  completed: boolean; // Means requirements are met
  rewardClaimed?: boolean; // Means points were added to user score
  link?: string;
  linkClicked?: boolean;
  lastClickTime?: number;
}

export interface ShopItem {
  id: string;
  name: string;
  img: string;
  description: string;
  cost: number;
  energy: number;
}

export enum GameScreen {
  GAME = 'game',
  SHOP = 'shop',
  QUESTS = 'quests',
  REF = 'ref'
}

export type LeaderboardCategory = 'points' | 'referrals' | 'spent';

export interface LeaderboardEntry {
  rank: number;
  name: string;
  value: number; // Score, Count, or Amount
  isCurrentUser: boolean;
}
