
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('CRITICAL: MONGODB_URI environment variable is not set.');
  console.error('Leaderboard and persistence will not work. Running in OFFLINE mode.');
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => {
      console.error('MongoDB connection error:', err);
      console.error('Please ensure MONGODB_URI is correctly set in your environment variables.');
    });
}

// User Schema
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  walletAddress: { type: String, default: null },
  score: { type: Number, default: 0 },
  referrals: { type: Number, default: 0 },
  spent: { type: Number, default: 0 },
  energy: { type: Number, default: 100 },
  lastEnergyUpdate: { type: Number, default: Date.now },
  level: { type: Number, default: 1 },
  lastActive: { type: Number, default: Date.now },
  quests: { type: Map, of: Boolean, default: {} }
});

const User = mongoose.model('User', userSchema);

// Health Check para o Render
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

const MAX_ENERGY = 100;
const RECHARGE_RATE = 100 / (12 * 60 * 60 * 1000); // 100 units per 12 hours

function calculateRechargedEnergy(user) {
  const now = Date.now();
  if (user.energy >= MAX_ENERGY) return { energy: user.energy, lastEnergyUpdate: now };
  
  const elapsed = now - (user.lastEnergyUpdate || user.lastActive || now);
  const recharged = elapsed * RECHARGE_RATE;
  const newEnergy = Math.min(MAX_ENERGY, user.energy + recharged);
  
  return { energy: newEnergy, lastEnergyUpdate: now };
}

// API Routes
app.get('/api/tonconnect/payload', (req, res) => {
  const payload = Math.random().toString(36).substring(2, 15);
  res.json({ payload });
});

app.get('/api/me', async (req, res) => {
  const { address, guestId } = req.query;
  const id = address ? `wallet_${address}` : (guestId as string || 'anonymous');
  
  try {
    let user = await User.findOne({ userId: id });
    
    if (user) {
      const { energy, lastEnergyUpdate } = calculateRechargedEnergy(user);
      user.energy = energy;
      user.lastEnergyUpdate = lastEnergyUpdate;
      await user.save();
      res.json(user);
    } else {
      const now = Date.now();
      user = new User({
        userId: id,
        walletAddress: address || null,
        score: 0,
        referrals: 0,
        spent: 0,
        energy: 100,
        lastEnergyUpdate: now,
        level: 1,
        lastActive: now,
        quests: {}
      });
      await user.save();
      res.json(user);
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.post('/api/save-progress', async (req, res) => {
  const { address, guestId, score, level, energy, referrals, spent, questId } = req.body;
  const id = address ? `wallet_${address}` : (guestId as string || 'anonymous');
  
  try {
    const now = Date.now();
    const updateData: any = { lastActive: now };
    if (score !== undefined) updateData.score = score;
    if (level !== undefined) updateData.level = level;
    if (energy !== undefined) {
        updateData.energy = energy;
        updateData.lastEnergyUpdate = now;
    }
    if (referrals !== undefined) updateData.referrals = referrals;
    if (spent !== undefined) updateData.spent = spent;
    
    let user = await User.findOne({ userId: id });
    
    if (user) {
      if (questId) {
        user.quests.set(questId, true);
        updateData.quests = user.quests;
      }
      Object.assign(user, updateData);
      await user.save();
      res.json({ success: true, user });
    } else {
      const newUser = new User({
        userId: id,
        walletAddress: address || null,
        score: score || 0,
        referrals: referrals || 0,
        spent: spent || 0,
        energy: energy !== undefined ? energy : 100,
        lastEnergyUpdate: now,
        level: level || 1,
        lastActive: now,
        quests: questId ? { [questId]: true } : {}
      });
      await newUser.save();
      res.json({ success: true, user: newUser });
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  const { type, address } = req.query;
  const userAddress = (address as string)?.toLowerCase();
  
  try {
    const sortField = type as string || 'score';
    const allUsers = await User.find().sort({ [sortField]: -1 }).limit(50);
    
    const rankedList = allUsers.map((u, index) => ({
      rank: index + 1,
      name: u.walletAddress ? `${u.walletAddress.slice(0, 4)}...${u.walletAddress.slice(-4)}` : `Guest_${u.userId.slice(-4)}`,
      value: type === 'referrals' ? u.referrals : (type === 'spent' ? u.spent : u.score),
      isCurrentUser: u.walletAddress?.toLowerCase() === userAddress
    }));

    let currentUserEntry = rankedList.find(u => u.isCurrentUser);

    // Se o usuário não estiver no top 50, vamos buscar a posição real dele
    if (!currentUserEntry && userAddress) {
      const user = await User.findOne({ walletAddress: { $regex: new RegExp(`^${userAddress}$`, 'i') } });
      if (user) {
        const count = await User.countDocuments({ [sortField]: { $gt: user[sortField as keyof typeof user] } });
        currentUserEntry = {
          rank: count + 1,
          name: `${user.walletAddress!.slice(0, 4)}...${user.walletAddress!.slice(-4)}`,
          value: type === 'referrals' ? user.referrals : (type === 'spent' ? user.spent : user.score),
          isCurrentUser: true
        };
      }
    }

    res.json({
      list: rankedList,
      currentUserEntry: currentUserEntry || null
    });
  } catch (e) {
    console.error("Leaderboard Error:", e);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Inicia o servidor para ambientes como Render, Railway ou Local
const PORT = Number(process.env.PORT) || 3000;

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*all', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Só inicia o listen se não estiver rodando como Firebase Function (opcional, mas seguro)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  const { createServer: createViteServer } = await import('vite');
  async function startVite() {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }
  startVite();
}
