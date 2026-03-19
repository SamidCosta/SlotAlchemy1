import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

// Import the Firebase configuration
import firebaseConfig from './firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();

// Validate connection to Firestore
async function testConnection() {
  try {
    // Use a simple getDoc instead of getDocFromServer to avoid strict connection timeout issues on boot
    // and only log if it's a definitive configuration error
    await getDoc(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error.code === 'failed-precondition' || error.message?.includes('database')) {
      console.error("Firebase Firestore configuration error. Please check your database ID.");
    }
  }
}
testConnection();

export { doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, orderBy, limit };
