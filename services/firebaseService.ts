import { db, auth, doc, setDoc, getDoc, updateDoc, serverTimestamp } from '../firebase';
import { getGuestId } from './api';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface UserMetrics {
  walletAddress: string;
  score: number;
  tonSpent: number;
  energy?: number;
  referrals?: number;
  questsCompleted?: string[];
  lastUpdate?: any;
}

export const saveUserMetrics = async (metrics: UserMetrics) => {
  const id = metrics.walletAddress || getGuestId();
  const path = `users/${id}`;
  
  try {
    const userDoc = doc(db, 'users', id);
    const docSnap = await getDoc(userDoc);
    
    const dataToSave = {
      ...metrics,
      lastUpdate: serverTimestamp()
    };

    if (docSnap.exists()) {
      await updateDoc(userDoc, dataToSave);
    } else {
      await setDoc(userDoc, dataToSave);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const getUserMetrics = async (walletAddress?: string) => {
  const id = walletAddress || getGuestId();
  const path = `users/${id}`;
  
  try {
    const userDoc = doc(db, 'users', id);
    const docSnap = await getDoc(userDoc);
    if (docSnap.exists()) {
      return docSnap.data() as UserMetrics;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
};
