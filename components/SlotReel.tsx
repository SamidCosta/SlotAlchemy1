
import React, { useState, useEffect, useRef } from 'react';
import { SYMBOLS } from '../constants';
import { SymbolData } from '../types';

interface SlotReelProps {
  index: number;
  spinning: boolean;
  finalSymbol?: SymbolData;
  onFinish: () => void;
}

const SYMBOL_HEIGHT = 100;

export const SlotReel: React.FC<SlotReelProps> = ({ index, spinning, finalSymbol, onFinish }) => {
  const [offset, setOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [reelSymbols, setReelSymbols] = useState<SymbolData[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initialReel = Array.from({ length: 5 }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
    setReelSymbols(initialReel);
  }, []);

  useEffect(() => {
    if (spinning && finalSymbol) {
      setIsAnimating(false);
      setOffset(0);

      // Quantidade de símbolos percorridos para alta velocidade
      const randomFill = Array.from({ length: 40 + index * 10 }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
      const newReel = [...reelSymbols, ...randomFill, finalSymbol, SYMBOLS[0], SYMBOLS[1]];
      setReelSymbols(newReel);

      const timer = setTimeout(() => {
        setIsAnimating(true);
        const targetIndex = reelSymbols.length + randomFill.length;
        setOffset(targetIndex * SYMBOL_HEIGHT);
      }, 30); 

      return () => clearTimeout(timer);
    }
  }, [spinning, finalSymbol]);

  const handleTransitionEnd = () => {
    if (spinning) {
      if (finalSymbol) {
        const finalIdx = SYMBOLS.findIndex(s => s.name === finalSymbol.name);
        const prevIdx = (finalIdx - 1 + SYMBOLS.length) % SYMBOLS.length;
        const nextIdx = (finalIdx + 1) % SYMBOLS.length;
        
        setIsAnimating(false);
        setReelSymbols([SYMBOLS[prevIdx], finalSymbol, SYMBOLS[nextIdx]]);
        setOffset(SYMBOL_HEIGHT); 
      }
      onFinish();
    }
  };

  // Escalonamento visual da parada dos rolos - Reduzido para sincronizar com áudio
  // Reel 0: 1.0s, Reel 1: 1.2s, Reel 2: 1.4s
  const duration = 1.0 + index * 0.2;

  return (
    <div className="slot-reel-container relative overflow-hidden h-[100px] w-full">
      <div
        ref={containerRef}
        className="absolute w-full flex flex-col items-center"
        style={{
          transform: `translate3d(0, -${offset}px, 0)`,
          // cubic-bezier(0.1, 0.7, 0.1, 1): Explosivo no início e fim súbito
          transition: isAnimating ? `transform ${duration}s cubic-bezier(0.1, 0.7, 0.1, 1)` : 'none',
          willChange: 'transform'
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {(reelSymbols || []).map((s, idx) => (
          <img
            key={`${s.name}-${idx}`}
            src={s.img}
            alt={s.name}
            className="slot-symbol select-none pointer-events-none"
            style={{ height: `${SYMBOL_HEIGHT}px`, width: '100%', objectFit: 'contain' }}
          />
        ))}
      </div>
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/40 via-transparent to-black/40 z-10"></div>
    </div>
  );
};
