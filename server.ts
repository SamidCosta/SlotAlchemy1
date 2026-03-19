
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Samid:Sete.1234567@cluster0.cscbtwo.mongodb.net/ton-game?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  walletAddress: { type: String, default: null },
  score: { type: Number, default: 0 },
  referrals: { type: Number, default: 0 },
  spent: { type: Number, default: 0 },
  energy: { type: Number, default: 100 },
  level: { type: Number, default: 1 },
  lastActive: { type: Number, default: Date.now },
  quests: { type: Map, of: Boolean, default: {} }
});

const User = mongoose.model('User', userSchema);

// Health Check para o Render
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

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
      res.json(user);
    } else {
      user = new User({
        userId: id,
        walletAddress: address || null,
        score: 0,
        referrals: 0,
        spent: 0,
        energy: 100,
        level: 1,
        lastActive: Date.now(),
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
    const updateData: any = { lastActive: Date.now() };
    if (score !== undefined) updateData.score = score;
    if (level !== undefined) updateData.level = level;
    if (energy !== undefined) updateData.energy = energy;
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
        energy: energy || 100,
        level: level || 1,
        lastActive: Date.now(),
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
  
  try {
    const sortField = type as string || 'score';
    const allUsers = await User.find().sort({ [sortField]: -1 }).limit(50);
    
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
  async function startVite() {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }
  startVite();
}
