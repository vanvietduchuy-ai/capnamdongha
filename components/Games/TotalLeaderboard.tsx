import React, { useEffect, useState } from 'react';
import { MockDB } from '../../services/mockDatabase';
import { User, GameType } from '../../types';

interface TotalLeaderboardProps {
    title: string;
}

interface UserTotalScore {
    user: User;
    totalScore: number;
    gamesPlayed: number;
    gameBreakdown: Record<string, number>;
}

export const TotalLeaderboard: React.FC<TotalLeaderboardProps> = ({ title }) => {
    const [scores, setScores] = useState<UserTotalScore[]>([]);
    const [loading, setLoading] = useState(true);

    const getGameName = (id: string) => {
        switch(id) {
            case GameType.CARO: return 'Caro';
            case GameType.SUDOKU: return 'Sudoku';
            case GameType.PUZZLE: return 'Xếp hình';
            default: return id;
        }
    };

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const rawScores = await MockDB.getGameScores(); // Get all scores
            const users = await MockDB.getUsers();

            // Aggregate scores by user
            const userMap = new Map<string, { total: number, count: number, breakdown: Record<string, number> }>();

            rawScores.forEach((s: any) => {
                const current = userMap.get(s.userId) || { total: 0, count: 0, breakdown: {} };
                
                const newBreakdown = { ...current.breakdown };
                newBreakdown[s.gameId] = (newBreakdown[s.gameId] || 0) + s.score;

                userMap.set(s.userId, { 
                    total: current.total + s.score, 
                    count: current.count + 1,
                    breakdown: newBreakdown
                });
            });

            const processed: UserTotalScore[] = [];
            userMap.forEach((val, userId) => {
                const user = users.find(u => u.id === userId);
                if (user) {
                    processed.push({
                        user: user,
                        totalScore: val.total,
                        gamesPlayed: val.count,
                        gameBreakdown: val.breakdown
                    });
                }
            });

            // Sort by total score DESC
            processed.sort((a, b) => b.totalScore - a.totalScore);

            // Keep top 10
            setScores(processed.slice(0, 10));
            setLoading(false);
        };

        load();
        
        const unsubscribe = MockDB.subscribe(load);
        return () => unsubscribe();
    }, []);

    if (loading) return <div className="p-4 text-center text-gray-500">Đang tải bảng tổng sắp...</div>;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-stone-100 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                    <span className="text-xl">🏆</span>
                    {title}
                </h3>
            </div>
            <div className="divide-y divide-stone-100">
                {scores.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 italic">Chưa có dữ liệu.</div>
                ) : (
                    scores.map((entry, idx) => (
                        <div key={idx} className="flex items-center p-3 hover:bg-stone-50 transition-colors">
                            <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold mr-3 ${
                                idx === 0 ? 'bg-yellow-100 text-yellow-600 ring-2 ring-yellow-300' :
                                idx === 1 ? 'bg-gray-100 text-gray-600 ring-2 ring-gray-300' :
                                idx === 2 ? 'bg-orange-100 text-orange-600 ring-2 ring-orange-300' :
                                'text-stone-400'
                            }`}>
                                {idx + 1}
                            </div>
                            <div className="flex-1">
                                <div className="font-bold text-stone-800">{entry.user.fullName}</div>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                    {Object.entries(entry.gameBreakdown).map(([gameId, score]) => (
                                        <span key={gameId} className="text-[9px] bg-stone-100 text-stone-600 px-1 py-0.5 rounded border border-stone-200">
                                            {getGameName(gameId)}: {score}
                                        </span>
                                    ))}
                                </div>
                                <div className="text-[10px] text-stone-500 mt-1">{entry.gamesPlayed} lượt chơi</div>
                            </div>
                            <div className="font-extrabold text-purple-600 text-lg">
                                {entry.totalScore.toLocaleString()}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
