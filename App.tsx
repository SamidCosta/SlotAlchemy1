
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { checkProof, getAccountInfo, saveProgress, getTonConnectPayload, getLeaderboard } from './services/api';
import { SYMBOLS, SHOP_ITEMS, DAILY_QUESTS, POINTS_NEEDED, TORCH_FRAMES, TOP_ANIMATION_FRAMES, WIN_ANIMATION_FRAMES, COIN_FRAMES, CLICK_SOUND_URL, WIN_SOUND_URL, COIN_SOUND_URL, SPIN_SOUND_URL, BACKGROUND_MUSIC_URL, DESTINATION_WALLET, JACKPOT_SOUND_BASE64 } from './constants';
import { GameScreen, LeaderboardCategory, LeaderboardEntry, ShopItem } from './types';
import { SlotReel } from './components/SlotReel';

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [currentScreen, setCurrentScreen] = useState<GameScreen>(GameScreen.GAME);
  
  // Game State
  const [energy, setEnergy] = useState(100);
  const [score, setScore] = useState(0);
  const [referrals, setReferrals] = useState(0);
  const [spent, setSpent] = useState(0);

  const [isSpinning, setIsSpinning] = useState(false);
  const [finishedReels, setFinishedReels] = useState(0);
  const [isAutoSpinning, setIsAutoSpinning] = useState(false); 
  const [multiplier, setMultiplier] = useState(1);
  const [spinResults, setSpinResults] = useState<(typeof SYMBOLS[0])[]>([]);
  const [quests, setQuests] = useState<any[]>(DAILY_QUESTS || []);
  
  // Animation/UI States
  const [torchFrame, setTorchFrame] = useState(0);
  const [topAnimFrame, setTopAnimFrame] = useState(0);
  const [winAnimFrame, setWinAnimFrame] = useState(-1);
  const [coinAnimFrame, setCoinAnimFrame] = useState(-1);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isMusicEnabled, setIsMusicEnabled] = useState(true);
  const [energyRechargeTime, setEnergyRechargeTime] = useState<string | null>(null);

  // Modal States
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);

  // Leaderboard State
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardCategory>('points');
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const spinAudioRef = useRef<HTMLAudioElement | null>(null);

  // Refs para controle de Auto-Spin
  const longPressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreNextClick = useRef(false);
  const isHolding = useRef(false);

  // Local Energy Recharge
  useEffect(() => {
    const interval = setInterval(() => {
      setEnergy(prev => {
        if (prev >= 100) {
            setEnergyRechargeTime(null);
            return prev;
        }
        
        const rechargeRate = 100 / (12 * 60 * 60); // 100 units per 12 hours (per second)
        const newEnergy = Math.min(100, prev + rechargeRate);
        
        // Calculate time to full
        const secondsToFull = (100 - newEnergy) / rechargeRate;
        const h = Math.floor(secondsToFull / 3600);
        const m = Math.floor((secondsToFull % 3600) / 60);
        const s = Math.floor(secondsToFull % 60);
        setEnergyRechargeTime(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
        
        return newEnergy;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync with Backend
  const syncWithBackend = useCallback((currentScore: number, currentSpent: number, currentEnergy: number, currentReferrals: number, currentQuests: any[]) => {
    if (!wallet && !localStorage.getItem('slot_alchemy_guest_id')) return;
    
    const completedQuestIds = currentQuests.filter(q => q.rewardClaimed).map(q => q.id);
    
    saveProgress({
      address: wallet?.account.address,
      score: currentScore,
      spent: currentSpent,
      energy: currentEnergy,
      referrals: currentReferrals,
      // questId logic is handled differently in saveProgress, but we can pass the data
    }).catch(err => console.error("Backend Sync Error:", err));
  }, [wallet]);

  // Lógica de Progressão Dinâmica
  const progression = useMemo(() => {
    let currentGoal = POINTS_NEEDED[0];
    let currentLevel = 1;
    let prevGoal = 0;

    for (let i = 0; i < POINTS_NEEDED.length; i++) {
      if (score < POINTS_NEEDED[i]) {
        currentGoal = POINTS_NEEDED[i];
        currentLevel = i + 1;
        prevGoal = i > 0 ? POINTS_NEEDED[i - 1] : 0;
        break;
      }
      if (i === POINTS_NEEDED.length - 1) {
        const lastFixed = POINTS_NEEDED[POINTS_NEEDED.length - 1];
        const step = 500;
        const extraSteps = Math.floor((score - lastFixed) / step) + 1;
        currentGoal = lastFixed + (extraSteps * step);
        currentLevel = POINTS_NEEDED.length + extraSteps;
        prevGoal = currentGoal - step;
      }
    }
    return { goal: currentGoal, level: currentLevel, prevGoal };
  }, [score]);

  // Preload assets and audio
  useEffect(() => {
    const spinAudio = new Audio(SPIN_SOUND_URL);
    spinAudio.preload = 'auto';
    spinAudio.loop = false; 
    spinAudioRef.current = spinAudio;

    // Preload win sounds
    [WIN_SOUND_URL, JACKPOT_SOUND_BASE64, CLICK_SOUND_URL].forEach(url => {
      const audio = new Audio(url);
      audio.preload = 'auto';
    });

    const allImages = [...COIN_FRAMES, ...WIN_ANIMATION_FRAMES, ...TOP_ANIMATION_FRAMES, ...TORCH_FRAMES];
    allImages.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  // Background Music
  useEffect(() => {
    if (!musicRef.current) {
        console.log("Initializing background music with URL:", BACKGROUND_MUSIC_URL);
        const audio = new Audio(BACKGROUND_MUSIC_URL);
        audio.loop = true;
        audio.volume = 0.25;
        
        // Skip the first 5 seconds of silence when metadata is loaded
        const handleCanPlay = () => {
            if (audio.currentTime < 5) {
                console.log("Music can play, setting currentTime to 5");
                audio.currentTime = 5;
            }
            audio.removeEventListener('canplay', handleCanPlay);
        };
        audio.addEventListener('canplay', handleCanPlay);
        
        audio.onerror = (e) => {
            console.error("Background music error:", e);
        };
        
        musicRef.current = audio;
    }
  }, []);

  useEffect(() => {
    if (!musicRef.current) return;
    
    const music = musicRef.current;
    console.log("Music effect triggered: isMusicEnabled=", isMusicEnabled, "loading=", loading);

    if (isMusicEnabled && !loading) {
        const attemptPlay = () => {
            console.log("Attempting to play music...");
            music.play().then(() => {
                console.log("Music playing successfully");
            }).catch((err) => {
                console.log("Autoplay blocked or failed:", err.message);
            });
        };

        attemptPlay();
        
        // Add a one-time listener to the document to catch the first interaction
        const handleFirstInteraction = () => {
            if (isMusicEnabled && music.paused) {
                console.log("First interaction detected, starting music");
                music.play().catch((err) => console.log("Interaction play failed:", err.message));
            }
            document.removeEventListener('click', handleFirstInteraction);
            document.removeEventListener('touchstart', handleFirstInteraction);
            document.removeEventListener('keydown', handleFirstInteraction);
        };
        
        document.addEventListener('click', handleFirstInteraction);
        document.addEventListener('touchstart', handleFirstInteraction);
        document.addEventListener('keydown', handleFirstInteraction);
        
        return () => {
            document.removeEventListener('click', handleFirstInteraction);
            document.removeEventListener('touchstart', handleFirstInteraction);
            document.removeEventListener('keydown', handleFirstInteraction);
        };
    } else {
        console.log("Pausing music: isMusicEnabled=", isMusicEnabled, "loading=", loading);
        music.pause();
    }
  }, [isMusicEnabled, loading]);

  useEffect(() => {
    if (isLeaderboardOpen) {
      setLoadingLeaderboard(true);
      getLeaderboard(leaderboardTab, wallet?.account.address)
        .then(res => {
          setLeaderboardData(res?.list || []);
        })
        .finally(() => setLoadingLeaderboard(false));
    }
  }, [isLeaderboardOpen, leaderboardTab, wallet]);

  const playClick = useCallback(() => {
    if (isSoundEnabled) {
      console.log("Playing click sound");
      new Audio(CLICK_SOUND_URL).play().catch(e => console.log("Click sound blocked:", e.message));
    }
  }, [isSoundEnabled]);

  const startSpinSound = useCallback(() => {
    if (isSoundEnabled && spinAudioRef.current) {
      console.log("Starting spin sound");
      spinAudioRef.current.currentTime = 0;
      spinAudioRef.current.play().then(() => {
        console.log("Spin sound playing");
      }).catch(e => console.log("Spin sound play blocked or failed:", e.message));
    } else {
      console.log("Spin sound not started: isSoundEnabled=", isSoundEnabled, "spinAudioRef.current=", !!spinAudioRef.current);
    }
  }, [isSoundEnabled]);

  const stopSpinSound = useCallback(() => {
    if (spinAudioRef.current) {
      spinAudioRef.current.pause();
      spinAudioRef.current.currentTime = 0;
    }
  }, []);

  useEffect(() => {
    const tInterval = setInterval(() => setTorchFrame(f => (f + 1) % TORCH_FRAMES.length), 150);
    const aInterval = setInterval(() => setTopAnimFrame(f => (f + 1) % TOP_ANIMATION_FRAMES.length), 200);
    return () => { clearInterval(tInterval); clearInterval(aInterval); };
  }, []);

  useEffect(() => {
    if (winAnimFrame >= 0) {
      const timer = setTimeout(() => {
        if (winAnimFrame < WIN_ANIMATION_FRAMES.length - 1) {
          setWinAnimFrame(winAnimFrame + 1);
        } else {
          setWinAnimFrame(-1);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [winAnimFrame]);

  useEffect(() => {
    if (coinAnimFrame >= 0) {
      const timer = setTimeout(() => {
        if (coinAnimFrame < COIN_FRAMES.length - 1) {
          setCoinAnimFrame(coinAnimFrame + 1);
        } else {
          setCoinAnimFrame(-1);
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [coinAnimFrame]);

  useEffect(() => {
    tonConnectUI.setConnectRequestParameters({ state: 'loading' });
    getTonConnectPayload().then(payload => {
        if (payload) {
            tonConnectUI.setConnectRequestParameters({
                state: 'ready',
                value: { tonProof: payload }
            });
        } else {
            tonConnectUI.setConnectRequestParameters(null);
        }
    }).catch(() => {
        tonConnectUI.setConnectRequestParameters(null);
    });
  }, [tonConnectUI]);

  useEffect(() => {
    const address = wallet?.account.address;
    getAccountInfo(address).then(res => {
        if(res.data) {
          setScore(res.data.score || 0);
          setEnergy(res.data.energy !== undefined ? res.data.energy : 100);
          setReferrals(res.data.referrals || 0);
          setSpent(res.data.spent || 0);

          if (res.data.quests && typeof res.data.quests === 'object') {
             setQuests(prev => (prev || []).map(q => ({
                 ...q,
                 rewardClaimed: !!res.data.quests[q.id],
                 completed: !!res.data.quests[q.id] || q.completed
             })));
          }
        }
    }).finally(() => setTimeout(() => setLoading(false), 2000));
  }, [wallet]);

  const spin = useCallback(() => {
    if (energy < 10 * multiplier || isSpinning) {
        if (isAutoSpinning) setIsAutoSpinning(false);
        return;
    }
    startSpinSound();
    setEnergy(currentEnergy => Math.max(0, currentEnergy - 10 * multiplier));
    setIsSpinning(true);
    setFinishedReels(0);
    setSpinResults([
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
    ]);
    setQuests(prev => (prev || []).map(q => {
        if (q.id === 'spin_10_times' && !q.completed) {
            const newProgress = q.currentProgress + 1;
            return { ...q, currentProgress: newProgress, completed: newProgress >= q.total };
        }
        return q;
    }));
  }, [isSpinning, isAutoSpinning, startSpinSound, multiplier, energy]);

  useEffect(() => {
    if (isAutoSpinning && !isSpinning) {
        const timer = setTimeout(spin, 400);
        return () => clearTimeout(timer);
    }
  }, [isAutoSpinning, isSpinning, spin]);

  const onReelFinish = () => {
    setFinishedReels(prev => {
        const next = prev + 1;
        if (next === 3) calculateWin();
        return next;
    });
  };

  const calculateWin = () => {
    if (spinResults.length !== 3) return;
    stopSpinSound();
    const counts: Record<string, number> = {};
    spinResults.forEach(s => counts[s.name] = (counts[s.name] || 0) + 1);
    let winAmount = 0;
    const maxCount = Math.max(...Object.values(counts));
    
    if (maxCount === 3) {
        winAmount = spinResults[0].value * 10;
        setWinAnimFrame(0);
        if (isSoundEnabled) {
          // Play Jackpot sound for 3 matches
          console.log("Playing Jackpot sound");
          new Audio(JACKPOT_SOUND_BASE64).play().catch(e => console.log("Jackpot sound blocked:", e.message));
        }
    } else if (maxCount === 2) {
         const match = spinResults.find(s => counts[s.name] === 2);
         if (match) winAmount = match.value * 5;
         if (isSoundEnabled) {
           // Play new Win sound for 2 matches
           console.log("Playing Win sound");
           new Audio(WIN_SOUND_URL).play().catch(e => console.log("Win sound blocked:", e.message));
         }
    }

    if (winAmount > 0) {
        const totalWin = winAmount * multiplier;
        setCoinAnimFrame(0); // Chuva de moedas em qualquer vitória
        if (isSoundEnabled) {
            new Audio(COIN_SOUND_URL).play().catch(e => console.log("Coin sound blocked:", e.message));
        }
        setScore(prev => {
          const newScore = prev + totalWin;
          syncWithBackend(newScore, spent, energy, referrals, quests);
          return newScore;
        });
    } else {
        syncWithBackend(score, spent, energy, referrals, quests);
    }
    saveProgress({ address: wallet?.account.address, score, energy, level: progression.level });
    setTimeout(() => { setIsSpinning(false); }, 400);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    isHolding.current = true;
    ignoreNextClick.current = false;
    longPressTimeout.current = setTimeout(() => {
      if (isHolding.current) {
        setIsAutoSpinning(true);
        ignoreNextClick.current = true;
        playClick();
        if (!isSpinning) spin();
      }
    }, 600);
  };

  const handlePointerUp = () => {
    isHolding.current = false;
    if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
  };

  const handleSpinButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (ignoreNextClick.current) {
      ignoreNextClick.current = false;
      return;
    }
    if (isAutoSpinning) {
      setIsAutoSpinning(false);
      playClick();
    } else {
      spin();
    }
  };

  const toggleWalletModal = () => {
    playClick();
    if (!wallet) {
      // Use modal.open() as it's more reliable in some versions
      if (tonConnectUI.modal) {
        tonConnectUI.modal.open();
      } else {
        tonConnectUI.openModal();
      }
    } else {
      setIsWalletModalOpen(true);
    }
  };

  const toggleSettingsModal = () => { playClick(); setIsSettingsModalOpen(!isSettingsModalOpen); };
  const toggleLeaderboardModal = () => { playClick(); setIsLeaderboardOpen(!isLeaderboardOpen); };

  const handleBuyItem = async (item: ShopItem) => {
    playClick();
    if (!wallet) {
      toggleWalletModal();
      return;
    }

    try {
      // TON Transaction
      const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 60, // 60 seconds
        messages: [
          {
            address: DESTINATION_WALLET,
            amount: (item.cost * 1000000000).toString(), // Convert to nanoTON
          },
        ],
      };

      const result = await tonConnectUI.sendTransaction(transaction);
      if (result) {
        // Success
        const newSpent = spent + item.cost;
        const newEnergy = energy + (item.energy || 0);
        setSpent(newSpent);
        setEnergy(newEnergy);
        
        // Save to Backend
        saveProgress({ address: wallet.account.address, spent: newSpent, energy: newEnergy });
        syncWithBackend(score, newSpent, newEnergy, referrals, quests);
        
        alert(`Success! You bought ${item.name}`);
      }
    } catch (e) {
      console.error("Purchase failed", e);
      alert("Purchase failed or cancelled.");
    }
  };

  const getProgressBarWidth = () => {
      const { goal, prevGoal } = progression;
      const range = goal - prevGoal;
      const progressInRange = score - prevGoal;
      return Math.min((progressInRange / range) * 100, 100);
  };

  return (
    <div className="game-container" onClick={() => {
      // Unlocks background music and spin sound on first user gesture
      if (isMusicEnabled && musicRef.current && musicRef.current.paused) {
        musicRef.current.play().catch(() => {});
      }
      // Prepare spin sound to be playable later (browser blessing)
      if (spinAudioRef.current && spinAudioRef.current.paused) {
          spinAudioRef.current.play().then(() => {
              spinAudioRef.current?.pause();
              spinAudioRef.current!.currentTime = 0;
          }).catch(() => {});
      }
      playClick();
    }}>
        {loading && (
            <div className="absolute inset-0 bg-[#111827] flex items-center justify-center z-[3000]">
                <img src="https://i.imgur.com/paZh95h.gif" className="w-32 h-32" alt="Loading" />
            </div>
        )}

        {/* ICONS */}
        <div className="absolute top-4 left-4 z-20 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleWalletModal(); }}>
            <i className={`fa-solid fa-wallet ${wallet ? 'text-green-500' : 'text-yellow-500'} text-3xl menu-icon`}></i>
        </div>
        <div className="absolute top-4 right-4 z-20 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleSettingsModal(); }}>
            <i className="fa-solid fa-gear text-yellow-500 text-3xl menu-icon"></i>
        </div>
        <div className="absolute top-16 right-4 z-20 cursor-pointer mt-2" onClick={(e) => { e.stopPropagation(); toggleLeaderboardModal(); }}>
            <i className="fa-solid fa-trophy text-yellow-400 text-3xl menu-icon"></i>
        </div>

        <div className="flex-grow w-full overflow-hidden relative z-10">
            {/* GAME SCREEN */}
            <div className={`absolute w-full h-full p-4 transition-transform duration-500 ease-in-out flex flex-col items-center ${currentScreen === GameScreen.GAME ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="top-animation-container">
                    <img src={TOP_ANIMATION_FRAMES[topAnimFrame]} alt="Anim" className="top-animation-image" />
                    {winAnimFrame >= 0 && (
                        <img src={WIN_ANIMATION_FRAMES[winAnimFrame]} alt="Win" className="top-animation-image absolute top-0 left-0 z-20" />
                    )}
                </div>

                {coinAnimFrame >= 0 && (
                    <div className="coin-animation-container">
                        <img src={COIN_FRAMES[coinAnimFrame]} alt="Moedas" />
                    </div>
                )}

                <div className="flex-grow flex flex-col items-center justify-center w-full">
                    <div className="score-bar-container">
                        <div className="score-bar-fill" style={{ width: `${getProgressBarWidth()}%` }}></div>
                        <span className="bar-text-overlay pixel-text">{Math.floor(score)} / {progression.goal}</span>
                    </div>

                    <div className="flex flex-col items-center gap-2 w-full px-4 mt-4">
                        <div className="slot-machine">
                            <div className="slot-window">
                                <SlotReel index={0} spinning={isSpinning} finalSymbol={spinResults[0]} onFinish={onReelFinish} />
                                <SlotReel index={1} spinning={isSpinning} finalSymbol={spinResults[1]} onFinish={onReelFinish} />
                                <SlotReel index={2} spinning={isSpinning} finalSymbol={spinResults[2]} onFinish={onReelFinish} />
                            </div>
                        </div>
                    </div>

                    <div className="energy-bar-container mt-4">
                        <div className="energy-bar-fill" style={{ width: `${Math.min(100, energy)}%` }}></div>
                        <div className="bar-text-overlay pixel-text flex flex-col items-center justify-center leading-none">
                            <span>{Math.floor(energy)} / 100</span>
                            {Math.floor(energy) === 0 && energyRechargeTime && (
                                <span className="text-[8px] text-yellow-400 mt-0.5">{energyRechargeTime}</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-center mt-4 z-50 mb-20 flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); playClick(); setMultiplier(m => m >= 5 ? 1 : m + 2); }} className="bg-purple-600 text-white px-3 py-1 rounded-lg text-sm mb-2 hover:bg-purple-500 transition-colors">
                        {multiplier}x
                    </button>
                    <div className="flex items-center justify-center">
                        <img src={TORCH_FRAMES[torchFrame]} className="torch mr-4" alt="Torch Left" />
                        <button 
                            onPointerDown={handlePointerDown}
                            onPointerUp={handlePointerUp}
                            onPointerLeave={handlePointerUp}
                            onContextMenu={(e) => e.preventDefault()}
                            onClick={handleSpinButtonClick}
                            disabled={isSpinning && !isAutoSpinning}
                            className={`px-6 py-3 rounded-xl text-xl font-bold uppercase transition-all transform active:scale-95 select-none ${isAutoSpinning ? 'bg-red-600 text-white animate-pulse' : 'bg-yellow-500 text-[#b54e12]'} ${(isSpinning && !isAutoSpinning) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}`}>
                            {isAutoSpinning ? 'Stop!' : 'Spin!'}
                        </button>
                        <img src={TORCH_FRAMES[torchFrame]} className="torch ml-4" alt="Torch Right" />
                    </div>
                </div>
            </div>

            <div className={`screen-background absolute w-full h-full transition-transform duration-500 p-4 flex flex-col items-center overflow-y-auto pb-20 ${currentScreen === GameScreen.SHOP ? 'translate-x-0' : 'translate-x-full'}`}>
                 <h2 className="text-3xl pixel-text text-yellow-400 mt-4">Shop</h2>
                 <div className="grid grid-cols-2 gap-4 mt-8 w-full max-md">
                     {SHOP_ITEMS?.map(item => (
                         <div key={item.id} className="shop-item" onClick={(e) => { e.stopPropagation(); handleBuyItem(item); }}>
                             <img src={item.img} className="shop-icon" alt={item.name} />
                             <span className="text-white text-[10px] font-bold mt-2">{item.name}</span>
                             <span className="text-yellow-300 text-[10px] font-bold mt-1">{item.cost} TON</span>
                         </div>
                     ))}
                 </div>
            </div>

            <div className={`screen-background absolute w-full h-full transition-transform duration-500 p-4 flex flex-col items-center overflow-y-auto pb-20 ${currentScreen === GameScreen.QUESTS ? 'translate-x-0' : 'translate-x-full'}`}>
                 <h2 className="text-3xl pixel-text text-yellow-400 mt-4">Missions</h2>
                 <div className="flex flex-col gap-2 mt-8 w-full">
                     {quests?.map(quest => (
                         <div key={quest.id} className="quest-item">
                             <div className="flex-1 text-left min-w-0">
                                 <h4 className="text-[8px] pixel-text text-white truncate">{quest.name}</h4>
                                 <div className="w-full bg-gray-700 h-1 mt-1 rounded">
                                     <div className="bg-green-500 h-full rounded" style={{ width: `${Math.min((quest.currentProgress/quest.total)*100, 100)}%` }}></div>
                                 </div>
                             </div>
                             {quest.completed && !quest.rewardClaimed ? (
                                 <button onClick={(e) => {
                                     e.stopPropagation(); playClick();
                                     const newScore = score + quest.reward.amount;
                                     setScore(newScore);
                                     const newQuests = (quests || []).map(q => q.id === quest.id ? {...q, rewardClaimed: true} : q);
                                     setQuests(newQuests);
                                     saveProgress({ address: wallet?.account.address, score: newScore, questId: quest.id });
                                     syncWithBackend(newScore, spent, energy, referrals, newQuests);
                                 }} className="bg-green-500 text-white px-2 py-1 text-[8px] rounded animate-pulse">CLAIM</button>
                             ) : quest.rewardClaimed ? (
                                 <span className="text-gray-500 text-[8px]">DONE</span>
                             ) : quest.link ? (
                                 <button onClick={(e) => { e.stopPropagation(); playClick(); window.open(quest.link, '_blank'); }} className="bg-blue-500 text-white px-2 py-1 text-[8px] rounded">GO</button>
                             ) : (
                                <span className="text-gray-400 text-[8px]">{quest.currentProgress}/{quest.total}</span>
                             )}
                         </div>
                     ))}
                 </div>
            </div>

            <div className={`screen-background absolute w-full h-full transition-transform duration-500 p-4 flex flex-col items-center pb-20 ${currentScreen === GameScreen.REF ? 'translate-x-0' : 'translate-x-full'}`}>
                 <h2 className="text-3xl pixel-text text-yellow-400 mt-4">Invites</h2>
                 <p className="text-gray-300 mt-2 text-[10px]">Total: <span className="text-yellow-400">{referrals}</span></p>
                 <div className="mt-8 p-4 bg-black/40 rounded-lg w-full max-w-sm">
                     <p className="text-[10px] mb-2">Share your link:</p>
                     <div className="p-2 bg-gray-700 rounded-md flex justify-between items-center text-[10px] truncate">
                         {`https://t.me/SlotAlchemyCryptoBot/playSlot?startapp=${wallet?.account.address?.slice(0,8) || 'guest'}`}
                         <i className="fa-solid fa-copy text-blue-400 ml-2 cursor-pointer" onClick={(e) => {
                             e.stopPropagation(); playClick();
                             navigator.clipboard.writeText(`https://t.me/SlotAlchemyCryptoBot/playSlot?startapp=${wallet?.account.address || 'guest'}`);
                         }}></i>
                     </div>
                 </div>
            </div>
        </div>

        {/* BOTTOM MENU */}
        <div className="bottom-menu-bar">
             <i className={`fa-solid fa-house text-2xl cursor-pointer ${currentScreen === GameScreen.GAME ? 'text-yellow-400' : 'text-gray-600'}`} onClick={() => setCurrentScreen(GameScreen.GAME)}></i>
             <i className={`fa-solid fa-shop text-2xl cursor-pointer ${currentScreen === GameScreen.SHOP ? 'text-yellow-400' : 'text-gray-600'}`} onClick={() => setCurrentScreen(GameScreen.SHOP)}></i>
             <i className={`fa-solid fa-scroll text-2xl cursor-pointer ${currentScreen === GameScreen.QUESTS ? 'text-yellow-400' : 'text-gray-600'}`} onClick={() => setCurrentScreen(GameScreen.QUESTS)}></i>
             <i className={`fa-solid fa-user-group text-2xl cursor-pointer ${currentScreen === GameScreen.REF ? 'text-yellow-400' : 'text-gray-600'}`} onClick={() => setCurrentScreen(GameScreen.REF)}></i>
        </div>

        {/* MODALS */}
        <div className={`modal-overlay ${isWalletModalOpen ? 'show' : ''}`} onClick={() => setIsWalletModalOpen(false)}>
             <div className="modal-content text-center" onClick={(e) => e.stopPropagation()}>
                 <button className="absolute top-2 right-2 text-white text-xl" onClick={() => setIsWalletModalOpen(false)}>&times;</button>
                 <h3 className="text-xl pixel-text text-yellow-400 mb-4">Wallet</h3>
                 {wallet ? (
                     <div className="p-4 bg-black/40 rounded-lg">
                         <i className="fa-solid fa-circle-check text-green-400 text-3xl mb-2"></i>
                         <p className="text-[10px] text-gray-300 mb-4 truncate">{wallet.account.address}</p>
                         <button onClick={() => { playClick(); tonConnectUI.disconnect(); setIsWalletModalOpen(false); }} className="bg-red-500 text-white px-4 py-2 rounded text-[10px] font-bold uppercase">Disconnect</button>
                     </div>
                 ) : (
                    <button onClick={() => tonConnectUI.openModal()} className="bg-blue-500 text-white px-6 py-3 rounded-lg font-bold">Connect Wallet</button>
                 )}
             </div>
        </div>

        <div className={`modal-overlay ${isSettingsModalOpen ? 'show' : ''}`} onClick={() => setIsSettingsModalOpen(false)}>
             <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                 <button className="absolute top-2 right-2 text-white text-xl" onClick={() => setIsSettingsModalOpen(false)}>&times;</button>
                 <h3 className="text-xl pixel-text text-yellow-400 mb-6 text-center">Settings</h3>
                 
                 <div className="flex flex-col gap-4">
                     <div className="flex items-center justify-between p-3 bg-black/40 rounded-lg">
                         <div className="flex items-center gap-3">
                             <i className={`fa-solid ${isSoundEnabled ? 'fa-volume-high text-green-400' : 'fa-volume-xmark text-red-400'}`}></i>
                             <span className="text-[10px] pixel-text">Sounds</span>
                         </div>
                         <button onClick={() => { playClick(); setIsSoundEnabled(!isSoundEnabled); }} className={`w-12 h-6 rounded-full relative transition-colors ${isSoundEnabled ? 'bg-green-500' : 'bg-gray-600'}`}>
                             <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isSoundEnabled ? 'left-7' : 'left-1'}`}></div>
                         </button>
                     </div>

                     <div className="flex items-center justify-between p-3 bg-black/40 rounded-lg">
                         <div className="flex items-center gap-3">
                             <i className={`fa-solid ${isMusicEnabled ? 'fa-music text-green-400' : 'fa-music text-red-400'}`}></i>
                             <span className="text-[10px] pixel-text">Music</span>
                         </div>
                         <button onClick={() => { playClick(); setIsMusicEnabled(!isMusicEnabled); }} className={`w-12 h-6 rounded-full relative transition-colors ${isMusicEnabled ? 'bg-green-500' : 'bg-gray-600'}`}>
                             <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isMusicEnabled ? 'left-7' : 'left-1'}`}></div>
                         </button>
                     </div>

                     <button 
                        onClick={() => {
                            console.log("Testing all sounds...");
                            const sounds = [
                                { name: "Click", url: CLICK_SOUND_URL },
                                { name: "Spin", url: SPIN_SOUND_URL },
                                { name: "Win", url: WIN_SOUND_URL },
                                { name: "Coin", url: COIN_SOUND_URL },
                                { name: "Jackpot", url: JACKPOT_SOUND_BASE64 },
                                { name: "Music", url: BACKGROUND_MUSIC_URL }
                            ];
                            sounds.forEach(s => {
                                const a = new Audio(s.url);
                                a.volume = 0.5;
                                a.play()
                                    .then(() => console.log(`Test: ${s.name} played successfully`))
                                    .catch(err => console.error(`Test: ${s.name} failed:`, err.message));
                            });
                        }}
                        className="mt-4 p-2 bg-blue-600 rounded text-[10px] pixel-text hover:bg-blue-500 transition-colors w-full"
                      >
                        TEST AUDIO (DEBUG)
                      </button>
                 </div>
             </div>
        </div>

        <div className={`modal-overlay ${isLeaderboardOpen ? 'show' : ''}`} onClick={() => setIsLeaderboardOpen(false)}>
             <div className="modal-content h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                 <button className="absolute top-2 right-2 text-white text-xl" onClick={() => setIsLeaderboardOpen(false)}>&times;</button>
                 <h3 className="text-xl pixel-text text-yellow-400 mb-4 text-center">Ranking</h3>
                 <div className="flex justify-around mb-4 border-b border-yellow-700/50 pb-2">
                     <button onClick={() => { playClick(); setLeaderboardTab('points'); }} className={`text-[8px] pixel-text ${leaderboardTab === 'points' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-400'}`}>Score</button>
                     <button onClick={() => { playClick(); setLeaderboardTab('referrals'); }} className={`text-[8px] pixel-text ${leaderboardTab === 'referrals' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-400'}`}>Refs</button>
                     <button onClick={() => { playClick(); setLeaderboardTab('spent'); }} className={`text-[8px] pixel-text ${leaderboardTab === 'spent' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-400'}`}>Spent</button>
                 </div>
                 <div className="flex-grow overflow-y-auto pr-1">
                     {loadingLeaderboard ? (
                         <div className="flex justify-center items-center h-full">
                             <img src="https://i.imgur.com/paZh95h.gif" className="w-16 h-16" alt="Loading" />
                         </div>
                     ) : (
                         <div className="flex flex-col gap-2">
                             {leaderboardData?.map((entry) => (
                                 <div key={entry.rank} className={`flex items-center justify-between p-2 rounded ${entry.isCurrentUser ? 'bg-yellow-600/30 border border-yellow-500' : 'bg-black/40'}`}>
                                     <div className="flex items-center gap-3">
                                         <span className={`text-[10px] w-6 ${entry.rank <= 3 ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>#{entry.rank}</span>
                                         <span className="text-[8px] pixel-text truncate max-w-[100px]">{entry.name}</span>
                                     </div>
                                     <span className="text-[8px] text-yellow-300">{Math.floor(entry.value)}</span>
                                 </div>
                             ))}
                         </div>
                     )}
                 </div>
                 <p className="text-[7px] text-center text-gray-500 mt-4 italic">Updated every hour</p>
             </div>
        </div>
    </div>
  );
};

export default App;
