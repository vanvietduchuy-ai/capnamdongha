import React, { useState, useEffect, useCallback } from 'react';
import { MockDB } from '../../services/mockDatabase';
import { User, GameType } from '../../types';

interface CaroGameProps {
    currentUser: User;
    gameId: string;
    onGameEnd: () => void;
}

const BOARD_SIZE = 15;

export const CaroGame: React.FC<CaroGameProps> = ({ currentUser, gameId, onGameEnd }) => {
    const [game, setGame] = useState<any>(null);
    const [board, setBoard] = useState<(string | null)[][]>([]);
    const [loading, setLoading] = useState(true);
    const [opponent, setOpponent] = useState<User | null>(null);

    const fetchGame = useCallback(async () => {
        const data = await MockDB.getCaroGame(gameId);
        if (data) {
            setGame(data);
            setBoard(JSON.parse(data.board));
            
            // Fetch opponent info if joined
            const opponentId = data.player1Id === currentUser.id ? data.player2Id : data.player1Id;
            if (opponentId && !opponent) {
                const users = await MockDB.getUsers();
                const opp = users.find(u => u.id === opponentId);
                if (opp) setOpponent(opp);
            }
        }
        setLoading(false);
    }, [gameId, currentUser.id, opponent]);

    useEffect(() => {
        fetchGame();
        const interval = setInterval(fetchGame, 2000);
        return () => clearInterval(interval);
    }, [fetchGame]);

    const checkWinner = (r: number, c: number, player: string, currentBoard: (string | null)[][]) => {
        const directions = [
            [0, 1],  // Horizontal
            [1, 0],  // Vertical
            [1, 1],  // Diagonal \
            [1, -1]  // Diagonal /
        ];

        for (const [dr, dc] of directions) {
            let count = 1;
            
            // Check forward
            for (let i = 1; i < 5; i++) {
                const nr = r + dr * i;
                const nc = c + dc * i;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && currentBoard[nr][nc] === player) {
                    count++;
                } else break;
            }
            
            // Check backward
            for (let i = 1; i < 5; i++) {
                const nr = r - dr * i;
                const nc = c - dc * i;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && currentBoard[nr][nc] === player) {
                    count++;
                } else break;
            }

            if (count >= 5) return true;
        }
        return false;
    };

    const handleCellClick = async (r: number, c: number) => {
        if (!game || game.status !== 'PLAYING' || game.turn !== currentUser.id || board[r][c] !== null) return;

        const newBoard = [...board];
        newBoard[r] = [...newBoard[r]];
        newBoard[r][c] = currentUser.id;

        const isWin = checkWinner(r, c, currentUser.id, newBoard);
        const nextTurn = currentUser.id === game.player1Id ? game.player2Id : game.player1Id;
        const winnerId = isWin ? currentUser.id : null;

        await MockDB.updateCaroMove(gameId, newBoard, nextTurn, winnerId);
        
        if (isWin) {
            await handleWin();
        }
    };

    const handleWin = async () => {
        // Scoring logic: base 500 + (opponent's total score / 100)
        // We need to get opponent's total score
        const allScores = await MockDB.getGameScores();
        const opponentScores = allScores.filter(s => s.userId === opponent?.id);
        const opponentTotal = opponentScores.reduce((sum, s) => sum + s.score, 0);
        
        const basePoints = 500;
        const bonus = Math.floor(opponentTotal / 100);
        const finalScore = basePoints + bonus;

        await MockDB.saveGameScore(currentUser.id, GameType.CARO, finalScore);
        alert(`Chúc mừng! Bạn đã chiến thắng và nhận được ${finalScore} điểm!`);
    };

    if (loading || !game) {
        return <div className="p-12 text-center text-stone-400">Đang tải trận đấu...</div>;
    }

    const isMyTurn = game.turn === currentUser.id;
    const isPlayer1 = game.player1Id === currentUser.id;
    const mySymbol = isPlayer1 ? 'X' : 'O';
    const opponentSymbol = isPlayer1 ? 'O' : 'X';

    return (
        <div className="flex flex-col items-center animate-fade-in-up">
            <div className="mb-6 flex justify-between w-full max-w-2xl px-4 items-center bg-white p-4 rounded-2xl shadow-sm border border-stone-100">
                <div className={`flex flex-col items-center p-2 rounded-xl transition-all ${isMyTurn ? 'bg-emerald-50 ring-2 ring-emerald-500' : ''}`}>
                    <div className="text-2xl font-bold text-emerald-600">{mySymbol}</div>
                    <div className="text-xs font-bold text-stone-800">BẠN</div>
                </div>

                <div className="text-center">
                    <div className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Trạng thái</div>
                    {game.status === 'WAITING' ? (
                        <div className="text-amber-500 font-bold animate-pulse">Đang chờ đối thủ...</div>
                    ) : game.status === 'FINISHED' ? (
                        <div className="text-red-600 font-bold uppercase">Trận đấu kết thúc</div>
                    ) : (
                        <div className={`font-bold ${isMyTurn ? 'text-emerald-600' : 'text-stone-400'}`}>
                            {isMyTurn ? 'Lượt của bạn' : 'Lượt đối thủ'}
                        </div>
                    )}
                </div>

                <div className={`flex flex-col items-center p-2 rounded-xl transition-all ${!isMyTurn && game.status === 'PLAYING' ? 'bg-red-50 ring-2 ring-red-500' : ''}`}>
                    <div className="text-2xl font-bold text-red-600">{opponentSymbol}</div>
                    <div className="text-xs font-bold text-stone-800">{opponent?.fullName.split(' ').pop() || 'ĐỐI THỦ'}</div>
                </div>
            </div>

            <div 
                className="grid bg-stone-300 gap-[1px] border border-stone-400 shadow-2xl rounded overflow-hidden"
                style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)` }}
            >
                {board.map((row, rIdx) => (
                    row.map((cell, cIdx) => (
                        <div 
                            key={`${rIdx}-${cIdx}`}
                            onClick={() => handleCellClick(rIdx, cIdx)}
                            className={`
                                w-6 h-6 sm:w-8 sm:h-8 bg-white flex items-center justify-center text-sm sm:text-lg font-bold cursor-pointer transition-all
                                ${cell === null && isMyTurn && game.status === 'PLAYING' ? 'hover:bg-emerald-50' : ''}
                                ${cell === currentUser.id ? 'text-emerald-600' : 'text-red-600'}
                            `}
                        >
                            {cell === null ? '' : (cell === game.player1Id ? 'X' : 'O')}
                        </div>
                    ))
                ))}
            </div>

            {game.status === 'FINISHED' && (
                <div className="mt-8 text-center">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">
                        {game.winnerId === currentUser.id ? 'Bạn đã thắng! 🎉' : 'Bạn đã thua! 💀'}
                    </h2>
                    <button 
                        onClick={onGameEnd}
                        className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-lg hover:bg-emerald-700 transition-all"
                    >
                        Quay lại sảnh
                    </button>
                </div>
            )}

            {game.status === 'WAITING' && (
                <button 
                    onClick={onGameEnd}
                    className="mt-8 text-stone-400 hover:text-stone-600 underline text-sm"
                >
                    Hủy phòng
                </button>
            )}
        </div>
    );
};
