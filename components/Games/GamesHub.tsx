import React, { useState } from 'react';
import { User, GameType } from '../../types';
import { SudokuGame } from './SudokuGame';
import { SlidingPuzzleGame } from './SlidingPuzzleGame';
import { CaroGame } from './CaroGame';
import { CaroLobby } from './CaroLobby';
import { Leaderboard } from './Leaderboard';
import { TotalLeaderboard } from './TotalLeaderboard';

interface GamesHubProps {
    currentUser: User;
}

export const GamesHub: React.FC<GamesHubProps> = ({ currentUser }) => {
    const [activeGame, setActiveGame] = useState<GameType | null>(null);
    const [activeTab, setActiveTab] = useState<'GAMES' | 'LEADERBOARD'>('GAMES');
    const [caroGameId, setCaroGameId] = useState<string | null>(null);

    const handleGameEnd = () => {
        setActiveGame(null);
        setCaroGameId(null);
    };

    if (activeGame === GameType.SUDOKU) {
        return (
            <div className="p-4 max-w-4xl mx-auto animate-fade-in-up">
                <div className="mb-4 flex items-center gap-2">
                    <button onClick={() => setActiveGame(null)} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                        <svg className="w-6 h-6 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </button>
                    <h2 className="text-2xl font-bold text-gray-800">Sudoku</h2>
                </div>
                <SudokuGame currentUser={currentUser} onGameEnd={handleGameEnd} />
            </div>
        );
    }

    if (activeGame === GameType.PUZZLE) {
        return (
            <div className="p-4 max-w-4xl mx-auto animate-fade-in-up">
                <div className="mb-4 flex items-center gap-2">
                    <button onClick={() => setActiveGame(null)} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                        <svg className="w-6 h-6 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </button>
                    <h2 className="text-2xl font-bold text-gray-800">Xếp hình (Sliding Puzzle)</h2>
                </div>
                <SlidingPuzzleGame currentUser={currentUser} onGameEnd={handleGameEnd} />
            </div>
        );
    }

    if (activeGame === GameType.CARO) {
        return (
            <div className="p-4 max-w-6xl mx-auto animate-fade-in-up">
                <div className="mb-4 flex items-center gap-2">
                    <button onClick={() => { setActiveGame(null); setCaroGameId(null); }} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                        <svg className="w-6 h-6 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </button>
                    <h2 className="text-2xl font-bold text-gray-800">Caro Online</h2>
                </div>
                {caroGameId ? (
                    <CaroGame currentUser={currentUser} gameId={caroGameId} onGameEnd={handleGameEnd} />
                ) : (
                    <CaroLobby currentUser={currentUser} onJoinGame={(id) => setCaroGameId(id)} />
                )}
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 animate-fade-in-up">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 mb-2">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Góc Giải Trí</h1>
                    <p className="text-stone-500 text-xs md:text-sm">Thư giãn sau những giờ làm việc căng thẳng</p>
                </div>
                
                <div className="flex bg-stone-100 p-1 rounded-xl w-full md:w-fit">
                    <button 
                        onClick={() => setActiveTab('GAMES')}
                        className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-lg font-bold text-xs md:text-sm transition-all ${activeTab === 'GAMES' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                    >
                        Trò chơi
                    </button>
                    <button 
                        onClick={() => setActiveTab('LEADERBOARD')}
                        className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-lg font-bold text-xs md:text-sm transition-all ${activeTab === 'LEADERBOARD' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                    >
                        Bảng xếp hạng
                    </button>
                </div>
            </div>

            {activeTab === 'GAMES' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                    {/* Caro Online */}
                    <div 
                        onClick={() => setActiveGame(GameType.CARO)}
                        className="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border border-stone-100 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-20 h-20 md:w-24 md:h-24 bg-emerald-50 rounded-bl-full -mr-10 -mt-10 md:-mr-12 md:-mt-12 transition-transform group-hover:scale-150"></div>
                        <div className="w-12 h-12 md:w-16 md:h-16 bg-emerald-100 text-emerald-600 rounded-xl md:rounded-2xl flex items-center justify-center mb-4 md:mb-6 relative z-10 text-2xl md:text-3xl group-hover:rotate-12 transition-transform">
                            ⚔️
                        </div>
                        <h3 className="text-base md:text-xl font-bold text-gray-800 mb-1 md:mb-2 relative z-10 uppercase">Caro Online</h3>
                        <p className="text-stone-500 text-xs md:text-sm leading-relaxed relative z-10 line-clamp-2 md:line-clamp-none">Thách đấu Caro cùng đồng nghiệp. Thắng người hạng cao nhận nhiều điểm hơn!</p>
                        <div className="mt-4 md:mt-6 flex items-center text-emerald-600 font-bold text-xs md:text-sm relative z-10">
                            Thách đấu ngay 
                            <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                        </div>
                    </div>

                    {/* Sudoku */}
                    <div 
                        onClick={() => setActiveGame(GameType.SUDOKU)}
                        className="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border border-stone-100 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-20 h-20 md:w-24 md:h-24 bg-blue-50 rounded-bl-full -mr-10 -mt-10 md:-mr-12 md:-mt-12 transition-transform group-hover:scale-150"></div>
                        <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-100 text-blue-600 rounded-xl md:rounded-2xl flex items-center justify-center mb-4 md:mb-6 relative z-10 text-2xl md:text-3xl group-hover:rotate-12 transition-transform">
                            🔢
                        </div>
                        <h3 className="text-base md:text-xl font-bold text-gray-800 mb-1 md:mb-2 relative z-10 uppercase">Sudoku</h3>
                        <p className="text-stone-500 text-xs md:text-sm leading-relaxed relative z-10 line-clamp-2 md:line-clamp-none">Rèn luyện tư duy logic với các con số từ mức độ Dễ đến Khó (100 Levels).</p>
                        <div className="mt-4 md:mt-6 flex items-center text-blue-600 font-bold text-xs md:text-sm relative z-10">
                            Chơi ngay 
                            <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                        </div>
                    </div>

                    {/* Sliding Puzzle */}
                    <div 
                        onClick={() => setActiveGame(GameType.PUZZLE)}
                        className="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border border-stone-100 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-20 h-20 md:w-24 md:h-24 bg-orange-50 rounded-bl-full -mr-10 -mt-10 md:-mr-12 md:-mt-12 transition-transform group-hover:scale-150"></div>
                        <div className="w-12 h-12 md:w-16 md:h-16 bg-orange-100 text-orange-600 rounded-xl md:rounded-2xl flex items-center justify-center mb-4 md:mb-6 relative z-10 text-2xl md:text-3xl group-hover:rotate-12 transition-transform">
                            🧩
                        </div>
                        <h3 className="text-base md:text-xl font-bold text-gray-800 mb-1 md:mb-2 relative z-10 uppercase">Xếp hình</h3>
                        <p className="text-stone-500 text-xs md:text-sm leading-relaxed relative z-10 line-clamp-2 md:line-clamp-none">Sắp xếp các mảnh ghép theo thứ tự với độ khó tăng dần (100 Levels).</p>
                        <div className="mt-4 md:mt-6 flex items-center text-orange-600 font-bold text-xs md:text-sm relative z-10">
                            Chơi ngay 
                            <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fade-in-up">
                    <div className="lg:col-span-1">
                        <TotalLeaderboard title="Bảng Tổng Sắp" />
                    </div>
                    <div className="lg:col-span-1">
                        <Leaderboard gameId={GameType.CARO} title="Top Caro" />
                    </div>
                    <div className="lg:col-span-1">
                        <Leaderboard gameId={GameType.SUDOKU} title="Top Sudoku" />
                    </div>
                    <div className="lg:col-span-1">
                        <Leaderboard gameId={GameType.PUZZLE} title="Top Xếp hình" />
                    </div>
                </div>
            )}
        </div>
    );
};
