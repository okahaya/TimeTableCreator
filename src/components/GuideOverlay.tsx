import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface GuideStepMeta {
  targetId: string;
  title: string;
  content: React.ReactNode;
  nextLabel?: string;
  disableNext?: boolean;
}

interface GuideProps {
  steps: GuideStepMeta[];
  currentStepIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  isOpen: boolean;
}

export const GuideOverlay: React.FC<GuideProps> = ({ steps, currentStepIndex, onNext, onPrev, onClose, isOpen }) => {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [docHeight, setDocHeight] = useState(0);
  
  const step = steps[currentStepIndex];

  // ドキュメントの高さを監視
  useEffect(() => {
    if (!isOpen) return;
    const updateHeight = () => {
        setDocHeight(Math.max(document.documentElement.scrollHeight, window.innerHeight));
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    // コンテンツの変化に対応するためポーリング(頻度低め)
    const interval = setInterval(updateHeight, 2000);
    return () => {
        window.removeEventListener('resize', updateHeight);
        clearInterval(interval);
    };
  }, [isOpen]);

  // ステップ変更時の処理
  useEffect(() => {
    // ターゲット切り替え時にRectをリセットするが、描画側でフォールバック(中央表示)を用意しているため消失はしない
    setRect(null);
    
    if (!isOpen || !step) return;
    
    let animationFrameId: number;
    const startTime = Date.now();
    let hasScrolled = false;
    let lastRectJSON = ""; // 前回のRect状態キャッシュ(GPU負荷軽減)

    const updateRect = () => {
        const el = document.getElementById(step.targetId);

        if (el) {
             const r = el.getBoundingClientRect();
             // 幅高さが0の要素（非表示など）の場合は無効とみなす
             if (r.width > 0 && r.height > 0) {
                 if (!hasScrolled) {
                     try {
                         el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
                     } catch(e) {}
                     hasScrolled = true;
                 }

                 const scrollX = window.scrollX || window.pageXOffset;
                 const scrollY = window.scrollY || window.pageYOffset;
                 
                 const top = r.top + scrollY - 8;
                 const left = r.left + scrollX - 8;
                 const width = r.width + 16;
                 const height = r.height + 16;

                 const newRectObj = {
                     top, left, width, height,
                     bottom: top + height,
                     right: left + width,
                     x: left, y: top
                 };

                 // 値が変わったときだけState更新
                 const currentJSON = JSON.stringify(newRectObj);
                 if (currentJSON !== lastRectJSON) {
                     lastRectJSON = currentJSON;
                     setRect({
                        ...newRectObj,
                        toJSON: () => {}
                     } as DOMRect);
                 }
             }
        }
        
        // 3秒間は追跡を試みる（要素が遅れて表示される場合に対応）
        if (Date.now() - startTime < 3000) {
             animationFrameId = requestAnimationFrame(updateRect);
        }
    };

    animationFrameId = requestAnimationFrame(updateRect);
    
    const handleResizeOrScroll = () => {
        const el = document.getElementById(step.targetId);
        if(el) {
             const r = el.getBoundingClientRect();
             const scrollX = window.scrollX || window.pageXOffset;
             const scrollY = window.scrollY || window.pageYOffset;
             
             // スクロール等のイベント時は即座に反映
             setRect({
                top: r.top + scrollY - 8,
                left: r.left + scrollX - 8,
                width: r.width + 16,
                height: r.height + 16,
                bottom: (r.top + scrollY - 8) + (r.height + 16),
                right: (r.left + scrollX - 8) + (r.width + 16),
                x: r.left + scrollX - 8,
                y: r.top + scrollY - 8,
                toJSON: () => {}
             } as DOMRect);
        }
    };

    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true); 
    
    return () => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', handleResizeOrScroll);
        window.removeEventListener('scroll', handleResizeOrScroll, true);
    };
  }, [step, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!isOpen) return;
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowRight' || e.key === 'Enter') onNext();
        if (e.key === 'ArrowLeft') onPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onNext, onPrev, onClose]);

  if (!isOpen || !step) return null;

  // Portal で document.body 直下にレンダリング
  // コンテナは pointer-events-none でクリックを透過、マスクとTooltipだけ auto でブロック
  return createPortal(
    <React.Fragment>
        <div 
            className="absolute top-0 left-0 w-full z-[99999] pointer-events-none"
            style={{ height: docHeight || '100%' }}
        >
            {rect ? (
                <>
                    {/* 4分割マスク (背景: 暗転) */}
                    <div className="absolute bg-black/50 pointer-events-auto transition-all duration-75 ease-linear"
                         style={{ left: 0, top: 0, right: 0, height: rect.top }} />
                    <div className="absolute bg-black/50 pointer-events-auto transition-all duration-75 ease-linear"
                         style={{ left: 0, top: rect.bottom, right: 0, bottom: 0 }} />
                    <div className="absolute bg-black/50 pointer-events-auto transition-all duration-75 ease-linear"
                         style={{ left: 0, top: rect.top, width: rect.left, height: rect.height }} />
                    <div className="absolute bg-black/50 pointer-events-auto transition-all duration-75 ease-linear"
                         style={{ left: rect.right, top: rect.top, right: 0, height: rect.height }} />

                    {/* Focus Border */}
                    <div 
                        className="absolute border-2 border-blue-500 rounded-lg pointer-events-none transition-all duration-75 ease-linear animate-in fade-in zoom-in-95"
                        style={{
                            left: rect.left,
                            top: rect.top,
                            width: rect.width,
                            height: rect.height,
                        }}
                    />
                </>
            ) : (
                // Rect未検知時のフォールバックマスク（全画面マスク）
                 <div className="absolute inset-0 bg-black/50 pointer-events-auto" />
            )}

            {/* Tooltip */}
            <div 
                className="absolute z-[100000] bg-white p-6 rounded-xl shadow-2xl max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto"
                style={rect ? {
                    left: Math.max(20, Math.min(document.documentElement.clientWidth - 360, rect.left)),
                    top: (rect.bottom + 250 > docHeight) ? rect.top - 200 : rect.bottom + 20
                } : {
                    // Rectがない場合は画面中央に固定表示
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    position: 'fixed'
                }}
            >
                <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-slate-800">{step.title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
                </div>
                <div className="text-slate-600 text-sm leading-relaxed mb-4 whitespace-pre-wrap">
                    {step.content}
                </div>
                <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>{currentStepIndex + 1} / {steps.length} (ESCで終了)</span>
                    <div className="flex gap-2">
                        {currentStepIndex > 0 && (
                            <button onClick={onPrev} className="px-3 py-1.5 hover:bg-slate-100 rounded text-slate-600 font-bold">前へ</button>
                        )}
                        <button 
                            onClick={onNext} 
                            disabled={step.disableNext}
                            className={`px-4 py-1.5 rounded-lg font-bold shadow-md transition-all ${
                                step.disableNext 
                                ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none' 
                                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                            }`}
                        >
                            {step.nextLabel || (currentStepIndex === steps.length - 1 ? '完了' : '次へ')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </React.Fragment>,
    document.body
  );
};
