import React, { useState, useEffect } from 'react';
import { MockDB } from '../../services/mockDatabase';
import { User } from '../../types';

interface CaroLobbyProps {
    currentUser: User;
    onJoinGame: (gameId: string) => void;
}

export const CaroLobby: React.FC<CaroLobbyProps> = ({ currentUser, onJoinGame }) => {
    const [availableGames, setAvailableGames] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchGames();
        const interval = setInterval(fetchGames, 5000);
        return () => clearInterval(interval);
    }, []);

    const fetchGames = async () => {
        const games = await MockDB.getAvailableCaroGames();
        setAvailableGames(games);
        setLoading(false);
    };

    const handleCreateGame = async () => {
        const gameId = await MockDB.createCaroGame(currentUser.id);
        onJoinGame(gameId);
    };

    const handleJoinGame = async (gameId: string) => {
        await MockDB.joinCaroGame(gameId, currentUser.id);
        onJoinGame(gameId);
    };

    return (
        <div className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm border border-stone-100 max-w-2xl mx-auto">
            <div className="text-center mb-8">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-4xl">
                    ⚔️
                </div>
                <h2 className="text-2xl font-bold text-gray-800">Caro Online</h2>
                <p className="text-stone-500">Thách đấu cùng đồng nghiệp</p>
            </div>

            <div className="w-full space-y-4 mb-8">
                <h3 className="text-sm font-bold text-stone-400 uppercase tracking-widest">Phòng đang chờ</h3>
                {loading ? (
                    <div className="py-8 text-center text-stone-400">Đang tìm phòng...</div>
                ) : availableGames.length === 0 ? (
                    <div className="py-12 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                        <p className="text-stone-400">Hiện không có phòng nào đang chờ.</p>
                        <p className="text-stone-400 text-xs mt-1">Hãy tạo phòng mới để bắt đầu!</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {availableGames.map(game => (
                            <div key={game.id} className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-100 hover:border-emerald-200 transition-all">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-stone-200 text-xl">
                                        👤
                                    </div>
                                    <div>
                                        <div className="font-bold text-stone-800">Phòng của ID: {game.player1Id.slice(0, 8)}</div>
                                        <div className="text-[10px] text-stone-400 uppercase font-bold tracking-tighter">Đang chờ đối thủ...</div>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleJoinGame(game.id)}
                                    className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-xl shadow-sm hover:bg-emerald-700 transition-all"
                                >
                                    Tham gia
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <button 
                onClick={handleCreateGame}
                className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg hover:bg-emerald-700 hover:-translate-y-1 transition-all flex items-center justify-center gap-2"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                Tạo phòng mới
            </button>
        </div>
    );
};
