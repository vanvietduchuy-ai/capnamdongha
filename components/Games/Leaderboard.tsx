import React, { useEffect, useState } from 'react';
import { MockDB } from '../../services/mockDatabase';
import { User, GameType } from '../../types';

interface LeaderboardProps {
    gameId?: GameType; // If null, show global (sum of points?) or just list all games
    title: string;
}

interface ScoreEntry {
    user: User;
    score: number;
    playedAt: number;
    gameId: string;
    gamesPlayed: number;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ gameId, title }) => {
    const [scores, setScores] = useState<ScoreEntry[]>([]);
    const [loading, setLoading] = useState(true);

    const getGameName = (id: string) => {
        switch(id) {
            case GameType.CARO: return 'Caro Online';
            case GameType.SUDOKU: return 'Sudoku';
            case GameType.PUZZLE: return 'Xếp hình';
            default: return 'Trò chơi';
        }
    };

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const rawScores = await MockDB.getGameScores(gameId);
            const users = await MockDB.getUsers();

            // Process scores
            // For Sudoku/Puzzle, lower score (time) is better? Or we use points?
            // Let's assume we store POINTS (higher is better) for simplicity in this generic component.
            // If the game stores TIME, we might need to invert the sort or have a prop.
            
            // Let's assume:
            // Sudoku: Score = 1000 - time_in_seconds (min 0)
            // Puzzle: Score = 1000 - time_in_seconds (min 0)
            // So higher is always better for the leaderboard.

            // Aggregate scores by user
            const userScoreMap = new Map<string, { total: number, count: number, latest: number }>();

            rawScores.forEach((s: any) => {
                const current = userScoreMap.get(s.userId) || { total: 0, count: 0, latest: 0 };
                userScoreMap.set(s.userId, {
                    total: current.total + s.score,
                    count: current.count + 1,
                    latest: Math.max(current.latest, s.playedAt)
                });
            });

            const processed: ScoreEntry[] = [];
            userScoreMap.forEach((val, userId) => {
                const user = users.find(u => u.id === userId);
                processed.push({
                    user: user || { id: userId, fullName: 'Unknown', username: 'unknown' } as User,
                    score: val.total,
                    playedAt: val.latest,
                    gameId: gameId || 'all',
                    gamesPlayed: val.count
                });
            });

            // Sort by score DESC
            processed.sort((a, b) => b.score - a.score);

            // Keep top 10
            setScores(processed.slice(0, 10));
            setLoading(false);
        };

        load();
        
        // Realtime subscription
        const unsubscribe = MockDB.subscribe(load);
        return () => unsubscribe();
    }, [gameId]);

    if (loading) return <div className="p-4 text-center text-gray-500">Đang tải bảng xếp hạng...</div>;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-stone-100 overflow-hidden">
            <div className="bg-gradient-to-r from-yellow-500 to-orange-500 p-4">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {title}
                </h3>
            </div>
            <div className="divide-y divide-stone-100">
                {scores.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 italic">Chưa có ai chơi trò này. Hãy là người đầu tiên!</div>
                ) : (
                    scores.map((entry, idx) => (
                        <div key={idx} className="flex items-center p-3 hover:bg-stone-50 transition-colors">
                            <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold mr-3 ${
                                idx === 0 ? 'bg-yellow-100 text-yellow-600' :
                                idx === 1 ? 'bg-gray-100 text-gray-600' :
                                idx === 2 ? 'bg-orange-100 text-orange-600' :
                                'text-stone-400'
                            }`}>
                                {idx + 1}
                            </div>
                            <div className="flex-1">
                                <div className="font-medium text-stone-800">{entry.user.fullName}</div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded uppercase">
                                        {getGameName(gameId || entry.gameId)}
                                    </span>
                                    <span className="text-[10px] text-stone-500">
                                        {entry.gamesPlayed} lượt • {new Date(entry.playedAt).toLocaleDateString('vi-VN')}
                                    </span>
                                </div>
                            </div>
                            <div className="font-bold text-indigo-600">
                                {entry.score} điểm
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
