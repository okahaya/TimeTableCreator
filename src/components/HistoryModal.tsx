import { X, Clock, Trash2, RotateCcw } from 'lucide-react';
import { PersistentHistoryItem } from '../hooks/usePersistentHistory';

// Utility for formatting date
const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString('ja-JP', { 
        month: 'short', day: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
    });
}

interface HistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    historyItems: PersistentHistoryItem[];
    onRestore: (item: PersistentHistoryItem) => void;
    onDelete: (id: string) => void;
}

export const HistoryModal = ({ isOpen, onClose, historyItems, onRestore, onDelete }: HistoryModalProps) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-xl">
                    <h2 className="font-bold text-lg flex items-center gap-2 text-slate-800">
                        <Clock size={20} className="text-slate-500"/>
                        保存された履歴
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
                        <X size={24}/>
                    </button>
                </div>
                
                <div className="overflow-y-auto p-4 flex-1 space-y-3">
                    {historyItems.length === 0 ? (
                        <div className="text-center py-10 text-slate-400">
                            <p>履歴がありません</p>
                        </div>
                    ) : (
                        historyItems.map(item => (
                            <div key={item.id} className="border rounded-lg p-4 hover:bg-slate-50 transition-colors flex justify-between items-center group">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="font-bold text-slate-700">{item.name}</span>
                                        <span className="text-xs text-slate-400 font-mono">{formatDate(item.createdAt)}</span>
                                    </div>
                                    <div className="text-xs text-slate-500 space-y-0.5">
                                        <p>ステージ数: {item.stages.length} / 団体数: {item.bands.length} / スコア: {item.score}</p>
                                        <p>短縮率: {item.stages.map(s => `${s.name}:${s.reductionRate}%`).join(', ')}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => {
                                            if (confirm('現在の状態を破棄して、この履歴を復元しますか？')) {
                                                onRestore(item);
                                                onClose();
                                            }
                                        }}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 shadow-md shadow-blue-200"
                                    >
                                        <RotateCcw size={14}/> 復元
                                    </button>
                                    <button 
                                        onClick={() => {
                                            if (confirm('この履歴を削除しますか？')) {
                                                onDelete(item.id);
                                            }
                                        }}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                                    >
                                        <Trash2 size={16}/>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                
                <div className="p-4 border-t bg-slate-50 rounded-b-xl text-right">
                    <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 font-medium">
                        閉じる
                    </button>
                </div>
            </div>
        </div>
    );
};
