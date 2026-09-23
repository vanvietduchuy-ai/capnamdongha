import React, { useState, useEffect } from 'react';
import { MockDB } from '../../services/mockDatabase';
import { User, GameType } from '../../types';

interface SlidingPuzzleGameProps {
    currentUser: User;
    onGameEnd: () => void;
}

export const SlidingPuzzleGame: React.FC<SlidingPuzzleGameProps> = ({ currentUser, onGameEnd }) => {
    const [level, setLevel] = useState(1);
    const [highestLevel, setHighestLevel] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [size, setSize] = useState(3);
    const [tiles, setTiles] = useState<number[]>([]);
    const [isComplete, setIsComplete] = useState(false);
    const [moves, setMoves] = useState(0);
    const [timer, setTimer] = useState(0);

    // Fetch progress
    useEffect(() => {
        const fetchProgress = async () => {
            const progress = await MockDB.getGameProgress(currentUser.id, GameType.PUZZLE);
            setHighestLevel(progress);
        };
        fetchProgress();
    }, [currentUser.id]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPlaying && !isComplete && tiles.length > 0) {
            interval = setInterval(() => {
                setTimer(t => t + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying, isComplete, tiles]);

    const startGame = (selectedLevel: number) => {
        if (selectedLevel > highestLevel + 1) return;
        setLevel(selectedLevel);
        
        // Determine grid size based on level
        let newSize = 3;
        if (selectedLevel > 30) newSize = 4;
        if (selectedLevel > 70) newSize = 5;
        
        setSize(newSize);
        initializeGame(newSize, selectedLevel);
        setIsPlaying(true);
    };

    const initializeGame = (gridSize: number, lvl: number) => {
        let newTiles = Array.from({ length: gridSize * gridSize }, (_, i) => i); // 0 to N-1
        
        // Shuffle based on level difficulty (more shuffles for higher levels?)
        // Actually, standard shuffle is fine, just ensure solvability.
        // We can use the level as a seed if we want consistent puzzles, but standard random is usually preferred for sliding puzzle replayability.
        // Let's stick to random shuffle for now, as "100 levels" usually implies difficulty progression (grid size here).
        
        do {
            newTiles = shuffle(newTiles);
        } while (!isSolvable(newTiles, gridSize) || isSolved(newTiles));
        
        setTiles(newTiles);
        setMoves(0);
        setTimer(0);
        setIsComplete(false);
    };

    const shuffle = (array: number[]) => {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    };

    const isSolvable = (tiles: number[], gridSize: number) => {
        let inversions = 0;
        const arrayWithoutZero = tiles.filter(t => t !== 0);
        
        for (let i = 0; i < arrayWithoutZero.length - 1; i++) {
            for (let j = i + 1; j < arrayWithoutZero.length; j++) {
                if (arrayWithoutZero[i] > arrayWithoutZero[j]) {
                    inversions++;
                }
            }
        }

        if (gridSize % 2 !== 0) {
            // Odd grid size: solvable if inversions is even
            return inversions % 2 === 0;
        } else {
            // Even grid size: solvable if (blank row from bottom + inversions) is even?
            // Actually: 
            // If grid width is even, solvable if:
            // - blank on even row from bottom (1, 3, 5...) and inversions is odd
            // - blank on odd row from bottom (0, 2, 4...) and inversions is even
            // Let's find blank row from bottom (0-indexed)
            const blankIndex = tiles.indexOf(0);
            const blankRowFromBottom = gridSize - 1 - Math.floor(blankIndex / gridSize);
            
            if (blankRowFromBottom % 2 === 0) { // Even row from bottom (0, 2...) -> Odd row in 1-based count from bottom
                 return inversions % 2 !== 0; // Inversions must be odd
            } else { // Odd row from bottom (1, 3...) -> Even row in 1-based count from bottom
                 return inversions % 2 === 0; // Inversions must be even
            }
        }
    };

    const isSolved = (tiles: number[]) => {
        for (let i = 0; i < tiles.length - 1; i++) {
            if (tiles[i] !== i + 1) return false;
        }
        return tiles[tiles.length - 1] === 0;
    };

    const handleTileClick = (index: number) => {
        if (isComplete) return;

        const emptyIndex = tiles.indexOf(0);
        const row = Math.floor(index / size);
        const col = index % size;
        const emptyRow = Math.floor(emptyIndex / size);
        const emptyCol = emptyIndex % size;

        const isAdjacent = Math.abs(row - emptyRow) + Math.abs(col - emptyCol) === 1;

        if (isAdjacent) {
            const newTiles = [...tiles];
            [newTiles[index], newTiles[emptyIndex]] = [newTiles[emptyIndex], newTiles[index]];
            setTiles(newTiles);
            setMoves(m => m + 1);

            if (isSolved(newTiles)) {
                setIsComplete(true);
                saveScore();
            }
        }
    };

    const saveScore = async () => {
        // Score calculation: Base 1000 + (Level * 50) - Moves - Time
        const baseScore = 1000 + (level * 50);
        const score = Math.max(0, baseScore - moves - timer);
        
        await MockDB.saveGameScore(currentUser.id, GameType.PUZZLE, score);
        await MockDB.updateGameProgress(currentUser.id, GameType.PUZZLE, level);
        
        // Update local highestLevel state
        if (level > highestLevel) setHighestLevel(level);

        alert(`Tuyệt vời! Bạn đã hoàn thành Level ${level} (${size}x${size}) trong ${timer} giây with ${moves} bước. Điểm số: ${score}`);
        setIsPlaying(false);
    };

    if (!isPlaying) {
        return (
            <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-sm border border-stone-100">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Chọn Level (1 - 100)</h2>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar p-2 w-full">
                    {Array.from({ length: 100 }, (_, i) => i + 1).map(l => {
                        let gridSize = 3;
                        if (l > 30) gridSize = 4;
                        if (l > 70) gridSize = 5;
                        
                        const isLocked = l > highestLevel + 1;
                        
                        return (
                            <button
                                key={l}
                                onClick={() => !isLocked && startGame(l)}
                                disabled={isLocked}
                                className={`w-full aspect-square flex flex-col items-center justify-center rounded-lg text-sm font-bold transition-all relative ${
                                    l === level ? 'bg-orange-500 text-white shadow-md scale-110' : 
                                    isLocked ? 'bg-stone-50 text-stone-300 cursor-not-allowed' : 'bg-stone-100 text-stone-600 hover:bg-orange-100'
                                }`}
                            >
                                {isLocked ? (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                                ) : (
                                    <>
                                        <span className="text-lg">{l}</span>
                                        <span className="text-[9px] opacity-70">{gridSize}x{gridSize}</span>
                                    </>
                                )}
                            </button>
                        );
                    })}
                </div>
                <div className="flex gap-4">
                    <button 
                        onClick={() => startGame(highestLevel + 1 <= 100 ? highestLevel + 1 : 100)} 
                        className="px-6 py-3 bg-orange-500 text-white font-bold rounded-xl shadow-lg hover:bg-orange-600 transition-all"
                    >
                        Tiếp tục Level {highestLevel + 1 <= 100 ? highestLevel + 1 : 100}
                    </button>
                    <button onClick={onGameEnd} className="px-6 py-3 bg-stone-100 text-stone-600 font-bold rounded-xl hover:bg-stone-200 transition-all">
                        Quay lại
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center animate-fade-in-up">
            <div className="mb-4 flex justify-between w-full max-w-xs px-4 items-center">
                <button onClick={() => setIsPlaying(false)} className="text-stone-400 hover:text-stone-600">
                    ← Chọn Level
                </button>
                <div className="font-bold text-xl text-orange-600">Level {level}</div>
                <div className="text-right">
                    <div className="font-bold text-stone-600 text-sm">{Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}</div>
                    <div className="font-bold text-blue-600 text-xs">Bước: {moves}</div>
                </div>
            </div>

            <div 
                className="grid gap-1 bg-stone-300 p-1 rounded-lg shadow-inner select-none"
                style={{ 
                    gridTemplateColumns: `repeat(${size}, 1fr)`, 
                    width: '300px', 
                    height: '300px' 
                }}
            >
                {tiles.map((tile, index) => (
                    <div
                        key={index}
                        onClick={() => handleTileClick(index)}
                        className={`
                            flex items-center justify-center font-bold rounded cursor-pointer transition-all duration-200
                            ${tile === 0 ? 'invisible' : 'bg-white text-stone-800 shadow-sm hover:bg-stone-50 active:scale-95'}
                        `}
                        style={{ fontSize: size === 5 ? '1.2rem' : '1.5rem' }}
                    >
                        {tile !== 0 ? tile : ''}
                    </div>
                ))}
            </div>

            <button onClick={() => initializeGame(size, level)} className="mt-6 px-6 py-2 bg-stone-100 text-stone-600 rounded-lg font-bold shadow-sm hover:bg-stone-200 transition-colors">
                Trộn lại
            </button>
        </div>
    );
};
