import axios from 'axios';
import { BACKEND_URL } from '../constants';
import { Account, TonProofItemReplySuccess } from '@tonconnect/ui-react';
import { LeaderboardCategory, LeaderboardEntry } from '../types';

const STORAGE_KEY = 'slot_alchemy_guest_id';

// Helper to get or create a persistent Guest ID
export const getGuestId = () => {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = `guest_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
};

// Fallback mock data in case the backend is unreachable
const MOCK_USER_DATA = {
  balance: 500,
  energy: 100,
  score: 0,
  level: 1,
  referrals: 0,
  spent: 0
};

export const getTonConnectPayload = async (): Promise<string | null> => {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/tonconnect/payload`);
    return response.data.payload;
  } catch (e) {
    return null;
  }
};

export const checkProof = async (account: Account, proof: TonProofItemReplySuccess['proof']) => {
  try {
    const reqBody = {
      address: account.address,
      network: account.chain,
      public_key: account.publicKey,
      proof: {
        ...proof,
        state_init: account.walletStateInit,
      },
    };

    const response = await axios.post(`${BACKEND_URL}/api/check-proof`, reqBody);
    return response.data;
  } catch (e) {
    console.log('Backend unavailable: Skipping proof verification (Offline Mode).');
    return { token: 'mock-offline-token' };
  }
};

export const getAccountInfo = async (address?: string) => {
  try {
    const params: any = {};
    if (address) {
        params.address = address;
    } else {
        params.guestId = getGuestId();
    }
    return await axios.get(`${BACKEND_URL}/api/me`, { params });
  } catch (e) {
    console.log('Backend unavailable: Loading local mock data (Offline Mode).');
    return { data: MOCK_USER_DATA };
  }
};

export const saveProgress = async (data: { 
    address?: string; 
    score?: number; 
    level?: number; 
    energy?: number;
    referrals?: number;
    spent?: number;
    questId?: string;
}) => {
  try {
    const payload = { ...data };
    // If no wallet address, inject Guest ID
    if (!payload.address) {
        // @ts-ignore
        payload.guestId = getGuestId();
    }
    return await axios.post(`${BACKEND_URL}/api/save-progress`, payload);
  } catch (e) {
    return { data: { success: true } };
  }
};

export const getLeaderboard = async (type: LeaderboardCategory, address?: string): Promise<{ list: LeaderboardEntry[], currentUserEntry: LeaderboardEntry }> => {
    try {
        const params: any = { type };
        if (address) {
            params.address = address;
        } else {
            params.guestId = getGuestId();
        }
        const response = await axios.get(`${BACKEND_URL}/api/leaderboard`, { params });
        return response.data;
    } catch (e) {
        console.log('Backend offline, returning empty leaderboard');
        return {
            list: [],
            currentUserEntry: {
                rank: 0,
                name: 'You',
                value: 0,
                isCurrentUser: true
            }
        };
    }
};