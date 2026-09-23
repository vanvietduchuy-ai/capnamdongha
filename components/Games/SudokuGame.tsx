import React, { useState, useEffect } from 'react';
import { MockDB } from '../../services/mockDatabase';
import { User, GameType } from '../../types';

// Base valid solution to shuffle
const BASE_SOLUTION = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9]
];

interface SudokuGameProps {
    currentUser: User;
    onGameEnd: () => void;
}

export const SudokuGame: React.FC<SudokuGameProps> = ({ currentUser, onGameEnd }) => {
    const [level, setLevel] = useState(1);
    const [highestLevel, setHighestLevel] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [board, setBoard] = useState<number[][]>([]);
    const [initialBoard, setInitialBoard] = useState<number[][]>([]);
    const [solution, setSolution] = useState<number[][]>([]);
    const [selectedCell, setSelectedCell] = useState<{r: number, c: number} | null>(null);
    const [timer, setTimer] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [mistakes, setMistakes] = useState(0);

    // Fetch progress
    useEffect(() => {
        const fetchProgress = async () => {
            const progress = await MockDB.getGameProgress(currentUser.id, GameType.SUDOKU);
            setHighestLevel(progress);
        };
        fetchProgress();
    }, [currentUser.id]);

    // Timer
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPlaying && !isComplete) {
            interval = setInterval(() => setTimer(t => t + 1), 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying, isComplete]);

    const startGame = (selectedLevel: number) => {
        if (selectedLevel > highestLevel + 1) return;
        setLevel(selectedLevel);
        const { newBoard, newSolution } = generateLevel(selectedLevel);
        setBoard(JSON.parse(JSON.stringify(newBoard)));
        setInitialBoard(JSON.parse(JSON.stringify(newBoard)));
        setSolution(newSolution);
        setTimer(0);
        setMistakes(0);
        setIsComplete(false);
        setIsPlaying(true);
        setSelectedCell(null);
    };

    // Pseudo-random generator based on seed (level)
    const seededRandom = (seed: number) => {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    };

    const generateLevel = (lvl: number) => {
        // Clone base
        let currentSolution = JSON.parse(JSON.stringify(BASE_SOLUTION));
        
        // Shuffle based on level to ensure same level = same puzzle
        // We use the level as a seed for deterministic "randomness" if we wanted consistent levels,
        // but for fun let's just use Math.random() mixed with level difficulty.
        // Actually, user requested "100 different levels", implying consistency.
        // Let's use a seed.
        let seed = lvl * 1337;

        const rand = () => {
            const x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        };

        // Shuffle Rows within bands
        for (let i = 0; i < 10; i++) {
            const band = Math.floor(rand() * 3);
            const r1 = band * 3 + Math.floor(rand() * 3);
            const r2 = band * 3 + Math.floor(rand() * 3);
            [currentSolution[r1], currentSolution[r2]] = [currentSolution[r2], currentSolution[r1]];
        }

        // Shuffle Cols within bands
        for (let i = 0; i < 10; i++) {
            const band = Math.floor(rand() * 3);
            const c1 = band * 3 + Math.floor(rand() * 3);
            const c2 = band * 3 + Math.floor(rand() * 3);
            for(let r=0; r<9; r++) {
                [currentSolution[r][c1], currentSolution[r][c2]] = [currentSolution[r][c2], currentSolution[r][c1]];
            }
        }

        // Create puzzle by removing numbers
        // Difficulty: Level 1 = 30 empty, Level 100 = 60 empty (approx)
        const emptyCount = 30 + Math.floor((lvl / 100) * 34); // Max 64 empty
        
        const newBoard = JSON.parse(JSON.stringify(currentSolution));
        let attempts = emptyCount;
        while(attempts > 0) {
            const r = Math.floor(rand() * 9);
            const c = Math.floor(rand() * 9);
            if (newBoard[r][c] !== 0) {
                newBoard[r][c] = 0;
                attempts--;
            }
        }

        return { newBoard, newSolution: currentSolution };
    };

    const handleCellClick = (r: number, c: number) => {
        if (initialBoard[r][c] !== 0) return; 
        setSelectedCell({ r, c });
    };

    const handleNumberInput = (num: number) => {
        if (!selectedCell || isComplete) return;
        const { r, c } = selectedCell;

        if (solution[r][c] === num) {
            const newBoard = [...board];
            newBoard[r][c] = num;
            setBoard(newBoard);
            checkWin(newBoard);
        } else {
            setMistakes(m => m + 1);
        }
    };

    const checkWin = (currentBoard: number[][]) => {
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                if (currentBoard[i][j] === 0) return;
            }
        }
        setIsComplete(true);
        saveScore();
    };

    const saveScore = async () => {
        // Score calculation: Base 1000 + (Level * 100) - Time - (Mistakes * 50)
        const baseScore = 1000 + (level * 100);
        const score = Math.max(0, baseScore - timer - (mistakes * 50));
        
        await MockDB.saveGameScore(currentUser.id, GameType.SUDOKU, score);
        await MockDB.updateGameProgress(currentUser.id, GameType.SUDOKU, level);
        
        // Update local highestLevel state
        if (level > highestLevel) setHighestLevel(level);

        alert(`Xuất sắc! Bạn đã vượt qua Level ${level} trong ${timer} giây. Điểm số: ${score}`);
        setIsPlaying(false);
    };

    if (!isPlaying) {
        return (
            <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-sm border border-stone-100">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Chọn Level (1 - 100)</h2>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar p-2 w-full">
                    {Array.from({ length: 100 }, (_, i) => i + 1).map(l => {
                        const isLocked = l > highestLevel + 1;
                        return (
                            <button
                                key={l}
                                onClick={() => !isLocked && startGame(l)}
                                disabled={isLocked}
                                className={`w-full aspect-square flex items-center justify-center rounded-lg text-sm font-bold transition-all relative ${
                                    l === level ? 'bg-blue-600 text-white shadow-md scale-110' : 
                                    isLocked ? 'bg-stone-50 text-stone-300 cursor-not-allowed' : 'bg-stone-100 text-stone-600 hover:bg-blue-100'
                                }`}
                            >
                                {isLocked ? (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                                ) : l}
                            </button>
                        );
                    })}
                </div>
                <div className="flex gap-4">
                    <button 
                        onClick={() => startGame(highestLevel + 1 <= 100 ? highestLevel + 1 : 100)} 
                        className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all"
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
            <div className="mb-4 flex justify-between w-full max-w-md px-4 items-center">
                <button onClick={() => setIsPlaying(false)} className="text-stone-400 hover:text-stone-600">
                    ← Chọn Level
                </button>
                <div className="font-bold text-xl text-blue-800">Level {level}</div>
                <div className="text-right">
                    <div className="font-bold text-stone-600 text-sm">{Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}</div>
                    <div className="font-bold text-red-600 text-xs">Lỗi: {mistakes}</div>
                </div>
            </div>

            <div className="grid grid-cols-9 gap-0.5 bg-stone-800 border-2 border-stone-800 mb-6 shadow-xl select-none">
                {board.map((row, rIdx) => (
                    row.map((cell, cIdx) => (
                        <div 
                            key={`${rIdx}-${cIdx}`}
                            onClick={() => handleCellClick(rIdx, cIdx)}
                            className={`
                                w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-lg font-bold cursor-pointer transition-colors
                                ${initialBoard[rIdx][cIdx] !== 0 ? 'bg-stone-200 text-stone-800' : 'bg-white text-blue-600'}
                                ${selectedCell?.r === rIdx && selectedCell?.c === cIdx ? 'bg-blue-100 ring-2 ring-blue-500 z-10' : ''}
                                ${(cIdx + 1) % 3 === 0 && cIdx !== 8 ? 'border-r-2 border-stone-400' : ''}
                                ${(rIdx + 1) % 3 === 0 && rIdx !== 8 ? 'border-b-2 border-stone-400' : ''}
                                ${selectedCell && board[rIdx][cIdx] === board[selectedCell.r][selectedCell.c] && board[rIdx][cIdx] !== 0 ? 'bg-blue-50' : ''}
                            `}
                        >
                            {cell !== 0 ? cell : ''}
                        </div>
                    ))
                ))}
            </div>

            <div className="grid grid-cols-5 gap-2 mb-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <button
                        key={num}
                        onClick={() => handleNumberInput(num)}
                        className="w-12 h-12 bg-white border border-stone-200 text-blue-600 rounded-xl font-bold text-xl shadow-sm active:scale-95 hover:bg-blue-50 transition-all"
                    >
                        {num}
                    </button>
                ))}
            </div>
        </div>
    );
};
