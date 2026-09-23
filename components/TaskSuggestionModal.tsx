import React, { useState, useEffect } from 'react';
import { Button } from './UI';
import { GeminiService } from '../services/geminiService';

interface Suggestion {
  title: string;
  description: string;
}

interface TaskSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (title: string, description: string) => void;
}

export const TaskSuggestionModal: React.FC<TaskSuggestionModalProps> = ({ isOpen, onClose, onSelect }) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && suggestions.length === 0) {
      loadSuggestions();
    }
  }, [isOpen]);

  const loadSuggestions = async () => {
    setIsLoading(true);
    const results = await GeminiService.generateOfficerSuggestions();
    setSuggestions(results);
    setIsLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 animate-fade-in-up">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border-t-4 border-yellow-500 flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-red-50 bg-red-900 text-white flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span>✨</span> AI Trợ Lý Nghiệp Vụ
            </h2>
            <p className="text-xs text-yellow-400 opacity-90">Đề xuất công việc dựa trên tình hình thực tế</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto bg-stone-50 flex-1">
          {isLoading ? (
             <div className="flex flex-col items-center justify-center py-10 space-y-4">
                <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin"></div>
                <p className="text-stone-500 font-medium animate-pulse">Đang phân tích dữ liệu & tạo đề xuất...</p>
             </div>
          ) : (
            <div className="space-y-3">
              {suggestions.length === 0 ? (
                <div className="text-center py-8 text-stone-500">
                  <p>Không có đề xuất nào.</p>
                  <Button variant="ghost" onClick={loadSuggestions} className="mt-2 text-red-600 hover:text-red-700">Thử lại</Button>
                </div>
              ) : (
                suggestions.map((s, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm hover:shadow-md hover:border-yellow-400 transition-all group">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h3 className="font-bold text-red-900 group-hover:text-red-700">{s.title}</h3>
                        <p className="text-sm text-stone-600 mt-1 leading-relaxed">{s.description}</p>
                      </div>
                      <button 
                        onClick={() => onSelect(s.title, s.description)}
                        className="shrink-0 bg-yellow-50 text-yellow-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-yellow-200 hover:bg-yellow-400 hover:text-red-900 hover:border-yellow-400 transition-all flex items-center gap-1"
                      >
                        <span>+</span> Chọn
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-stone-100 flex justify-between items-center">
           <p className="text-xs text-stone-400 italic">Được hỗ trợ bởi Google Gemini AI</p>
           <div className="flex gap-2">
             <Button variant="ghost" onClick={loadSuggestions} disabled={isLoading} icon={<span className="text-lg">↻</span>}>Làm mới</Button>
             <Button variant="secondary" onClick={onClose}>Đóng</Button>
           </div>
        </div>
      </div>
    </div>
  );
};