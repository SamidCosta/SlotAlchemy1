
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { db, collection, getDocs, getDoc, setDoc, updateDoc, doc, query, orderBy, limit } from './firebase';
import { onRequest } from 'firebase-functions/v2/https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// API Routes
app.get('/api/tonconnect/payload', (req, res) => {
  const payload = Math.random().toString(36).substring(2, 15);
  res.json({ payload });
});

// ... (rest of the routes stay the same)
app.get('/api/me', async (req, res) => {
  const { address, guestId } = req.query;
  const id = address ? `wallet_${address}` : (guestId as string || 'anonymous');
  
  try {
    const userDoc = doc(db, 'users', id);
    const docSnap = await getDoc(userDoc);
    
    if (docSnap.exists()) {
      res.json(docSnap.data());
    } else {
      const newUser = {
        userId: id,
        walletAddress: address || null,
        score: 0,
        referrals: 0,
        spent: 0,
        energy: 100,
        level: 1,
        lastActive: Date.now(),
        quests: {}
      };
      await setDoc(userDoc, newUser);
      res.json(newUser);
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.post('/api/save-progress', async (req, res) => {
  const { address, guestId, score, level, energy, referrals, spent, questId } = req.body;
  const id = address ? `wallet_${address}` : (guestId as string || 'anonymous');
  
  try {
    const userDoc = doc(db, 'users', id);
    const docSnap = await getDoc(userDoc);
    
    const updateData: any = { lastActive: Date.now() };
    if (score !== undefined) updateData.score = score;
    if (level !== undefined) updateData.level = level;
    if (energy !== undefined) updateData.energy = energy;
    if (referrals !== undefined) updateData.referrals = referrals;
    if (spent !== undefined) updateData.spent = spent;
    
    if (docSnap.exists()) {
      const userData = docSnap.data();
      if (questId) {
        const quests = userData.quests || {};
        quests[questId] = true;
        updateData.quests = quests;
      }
      await updateDoc(userDoc, updateData);
      res.json({ success: true, user: { ...userData, ...updateData } });
    } else {
      const newUser = {
        userId: id,
        walletAddress: address || null,
        score: score || 0,
        referrals: referrals || 0,
        spent: spent || 0,
        energy: energy || 100,
        level: level || 1,
        lastActive: Date.now(),
        quests: questId ? { [questId]: true } : {}
      };
      await setDoc(userDoc, newUser);
      res.json({ success: true, user: newUser });
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  const { type, address } = req.query;
  
  try {
    const usersCol = collection(db, 'users');
    const q = query(usersCol, orderBy(type as string || 'score', 'desc'), limit(50));
    const querySnapshot = await getDocs(q);
    
    const allUsers: any[] = [];
    querySnapshot.forEach((doc) => {
      allUsers.push(doc.data());
    });

    const rankedList = allUsers.map((u, index) => ({
      rank: index + 1,
      name: u.walletAddress ? `${u.walletAddress.slice(0, 4)}...${u.walletAddress.slice(-4)}` : `Guest_${u.userId.slice(-4)}`,
      value: type === 'referrals' ? u.referrals : (type === 'spent' ? u.spent : u.score),
      isCurrentUser: u.walletAddress === address
    }));

    res.json({
      list: rankedList,
      currentUserEntry: rankedList.find(u => u.isCurrentUser) || { rank: 999, name: 'You', value: 0, isCurrentUser: true }
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Exporta para o Firebase Functions
export const api = onRequest(app);

// Mantém o servidor local rodando para desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  async function startVite() {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    
    const PORT = 3000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Local server running on http://localhost:${PORT}`);
    });
  }
  startVite();
}
