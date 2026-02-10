import { useState, useEffect } from 'react';
import { Save, X, Edit2 } from 'lucide-react';

interface SaveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  defaultName: string;
  title?: string;
  inputLabel?: string;
  submitLabel?: string;
}

export const SaveDialog = ({ 
  isOpen, 
  onClose, 
  onSave, 
  defaultName, 
  title = "保存名を入力", 
  inputLabel = "保存する名前",
  submitLabel = "保存する"
}: SaveDialogProps) => {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
    }
  }, [isOpen, defaultName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg flex items-center gap-2 text-slate-800">
            {title.includes("変更") ? <Edit2 size={20} className="text-blue-600"/> : <Save size={20} className="text-emerald-600"/>}
            {title}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={20}/>
          </button>
        </div>
        
        <div className="p-6">
          <label className="block text-sm font-bold text-slate-700 mb-2">
            {inputLabel}
          </label>
          <input 
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (name.trim()) onSave(name);
              }
            }}
          />
          <p className="text-xs text-slate-500 mt-2">
            {title.includes("保存") ? "※保存したデータは「履歴」からいつでも復元できます" : ""}
          </p>
        </div>
        
        <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            キャンセル
          </button>
          <button 
            onClick={() => onSave(name)}
            disabled={!name.trim()}
            className="px-6 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
