import React from 'react';
import { DutyInfo } from '../../types';
import { Shield, Plus, Calendar, Map, Image as ImageIcon, Trash2, Edit, ArrowLeft } from 'lucide-react';

interface DutyListProps {
  duties: DutyInfo[];
  isLeader: boolean;
  onSelect: (duty: DutyInfo) => void;
  onCreate: () => void;
  onEdit: (duty: DutyInfo) => void;
  onDelete: (duty: DutyInfo) => void;
  onBack?: () => void;
}

export const DutyList: React.FC<DutyListProps> = ({ 
  duties, 
  isLeader, 
  onSelect, 
  onCreate, 
  onEdit, 
  onDelete,
  onBack
}) => {
  return (
    <div className="flex flex-col h-full bg-stone-100 p-4 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
             {onBack && (
               <button onClick={onBack} className="p-2 hover:bg-stone-200 rounded-full transition-colors text-stone-600">
                 <ArrowLeft size={24} />
               </button>
             )}
             <h2 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
               <Shield className="text-red-600" />
               Danh sách Sự kiện Bảo vệ
             </h2>
          </div>
          {isLeader && (
            <button 
              onClick={onCreate}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm transition-colors"
            >
              <Plus size={18} />
              Tạo mới
            </button>
          )}
        </div>

        {duties.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-stone-200">
            <Shield size={48} className="mx-auto text-stone-300 mb-4" />
            <h3 className="text-lg font-medium text-stone-600">Chưa có sự kiện nào</h3>
            <p className="text-stone-500 mb-6">Bắt đầu bằng cách tạo một sự kiện bảo vệ mới.</p>
            {isLeader && (
              <button 
                onClick={onCreate}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium inline-flex items-center gap-2"
              >
                <Plus size={18} />
                Tạo sự kiện ngay
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {duties.map(duty => (
              <div 
                key={duty.id}
                className="bg-white rounded-xl shadow-sm border border-stone-200 hover:shadow-md transition-shadow overflow-hidden flex flex-col"
              >
                <div 
                  className="h-32 bg-stone-100 relative cursor-pointer group"
                  onClick={() => onSelect(duty)}
                >
                  {duty.mapType === 'image' && duty.mapImageUrl ? (
                    <img 
                      src={duty.mapImageUrl} 
                      alt={duty.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-blue-50">
                      <Map size={48} className="text-blue-200" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-2 py-1 rounded text-xs font-bold shadow-sm flex items-center gap-1">
                    {duty.mapType === 'image' ? <ImageIcon size={12} /> : <Map size={12} />}
                    {duty.mapType === 'image' ? 'Sơ đồ ảnh' : 'Bản đồ thực'}
                  </div>
                  {duty.isActive && (
                    <div className="absolute top-2 left-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-bold shadow-sm animate-pulse">
                      Đang diễn ra
                    </div>
                  )}
                </div>
                
                <div className="p-4 flex-1 flex flex-col">
                  <h3 
                    className="font-bold text-lg text-stone-800 mb-2 cursor-pointer hover:text-blue-600 line-clamp-2"
                    onClick={() => onSelect(duty)}
                  >
                    {duty.title}
                  </h3>
                  
                  <div className="space-y-2 text-sm text-stone-600 mb-4 flex-1">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-stone-400" />
                      <span>Bắt đầu: {new Date(duty.startTime).toLocaleString('vi-VN')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-stone-400" />
                      <span>Kết thúc: {new Date(duty.endTime).toLocaleString('vi-VN')}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-stone-100">
                    <button 
                      onClick={() => onSelect(duty)}
                      className="text-blue-600 font-medium text-sm hover:underline"
                    >
                      Xem chi tiết →
                    </button>
                    
                    {isLeader && (
                      <div className="flex gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); onEdit(duty); }}
                          className="p-1.5 text-stone-500 hover:bg-stone-100 rounded hover:text-blue-600 transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onDelete(duty); }}
                          className="p-1.5 text-stone-500 hover:bg-red-50 rounded hover:text-red-600 transition-colors"
                          title="Xóa"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
