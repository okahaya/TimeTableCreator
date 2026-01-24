import React from 'react';
import { X, BookOpen, Calendar, Settings, Upload, Play, CheckCircle2, AlertTriangle, MousePointerClick } from 'lucide-react';

interface UsageGuideProps {
    isOpen: boolean;
    onClose: () => void;
}

export const UsageGuide: React.FC<UsageGuideProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b bg-slate-50 flex justify-between items-center shrink-0">
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <BookOpen className="text-blue-600" />
                        使い方ガイド
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={24} className="text-slate-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-12">
                    
                    {/* Introduction */}
                    <div className="prose prose-slate max-w-none">
                        <p className="lead text-lg text-slate-600">
                            TimeTable Creatorへようこそ！このアプリは、複数の出演団体の希望時間を考慮しながら、
                            最適なステージ進行表を自動で作成するツールです。
                        </p>
                    </div>

                    {/* Step 1: Settings */}
                    <section className="space-y-4">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800 border-b pb-2">
                            <span className="bg-blue-100 text-blue-700 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                            基本設定を行う
                        </h3>
                        <div className="grid md:grid-cols-2 gap-6 items-start">
                            <div className="space-y-2 text-sm text-slate-600">
                                <p>画面左側のサイドバーで、イベントの基本的な枠組みを設定します。</p>
                                <ul className="list-disc list-inside space-y-1 ml-2">
                                    <li><b>開催日数</b>: イベントの日数（最大10日）</li>
                                    <li><b>時間設定</b>: 日ごとの開始・終了時間</li>
                                    <li><b>時間短縮</b>: スケジュールが入り切らない場合、全体の持ち時間を一律で短縮して隙間を作ります。</li>
                                </ul>
                            </div>
                            <div className="bg-slate-100 p-4 rounded-lg border border-slate-200">
                                <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-2">
                                    <Settings size={14} /> サイドバー設定項目
                                </div>
                                <div className="space-y-2 opacity-75 pointer-events-none">
                                    <div className="h-8 bg-white rounded border w-full"></div>
                                    <div className="h-8 bg-white rounded border w-3/4"></div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Step 2: Data Entry */}
                    <section className="space-y-4">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800 border-b pb-2">
                            <span className="bg-blue-100 text-blue-700 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                            データを入力する
                        </h3>
                        <p className="text-sm text-slate-600">
                            「データ入力」画面に切り替えて、出演団体の情報を登録します。
                        </p>
                        
                        <div className="grid md:grid-cols-3 gap-4">
                            <div className="col-span-1 p-4 bg-blue-50 rounded-xl border border-blue-100">
                                <h4 className="font-bold text-blue-800 flex items-center gap-2 mb-2">
                                    <Upload size={16} /> CSVインポート
                                </h4>
                                <p className="text-xs text-blue-700 mb-2">
                                    Excel等で作成したデータを一括で読み込めます。
                                </p>
                                <div className="bg-white p-2 rounded text-[10px] font-mono border text-slate-500">
                                    団体名, 持ち時間(分), 日程1, 開始1, 日程2, 開始2...<br/>
                                    バンドA, 30, 1, 12:00, 2, 14:00<br/>
                                    バンドB, 45, 1, 15:30
                                </div>
                            </div>
                            
                            <div className="col-span-1 p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <h4 className="font-bold text-slate-700 flex items-center gap-2 mb-2">
                                    <MousePointerClick size={16} /> 手動入力
                                </h4>
                                <p className="text-xs text-slate-600">
                                    「新規追加」ボタンから1件ずつ登録できます。第1〜第3希望まで入力可能です。
                                </p>
                            </div>

                            <div className="col-span-1 p-4 bg-orange-50 rounded-xl border border-orange-100">
                                <h4 className="font-bold text-orange-800 flex items-center gap-2 mb-2">
                                    <span className="text-xs border border-orange-300 px-1 rounded">TIP</span> デモデータ
                                </h4>
                                <p className="text-xs text-orange-700">
                                    動作を試したい場合は「デモデータ」ボタンを押すと、ランダムなデータが生成されます。
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Step 3: Optimize */}
                    <section className="space-y-4">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800 border-b pb-2">
                            <span className="bg-blue-100 text-blue-700 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                            自動作成を実行
                        </h3>
                        <div className="flex gap-4 items-start">
                            <div className="flex-1 text-sm text-slate-600 space-y-3">
                                <p>
                                    左下の「<Play size={12} className="inline"/> スケジュールを作成」ボタンを押すと、AIロジックが最適な組み合わせを計算します。
                                </p>
                                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                                    <h5 className="font-bold text-yellow-800 text-xs flex items-center gap-1 mb-1">
                                        <AlertTriangle size={12} /> うまくいかない場合
                                    </h5>
                                    <ul className="list-disc list-inside text-xs text-yellow-700 space-y-1">
                                        <li><b>時間が足りない</b>: 「全体の時間短縮」スライダーを右に動かして、持ち時間を圧縮してみてください。</li>
                                        <li><b>条件が厳しすぎる</b>: 「詳細設定」から「希望外(赤)を許可」にチェックを入れると、希望時間外への配置も検討します。</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </section>
                    
                    {/* Step 4: Adjust */}
                    <section className="space-y-4">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800 border-b pb-2">
                            <span className="bg-blue-100 text-blue-700 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">4</span>
                            確認・微調整
                        </h3>
                        <p className="text-sm text-slate-600">
                            作成されたスケジュールは「ダッシュボード」で確認できます。
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="border rounded-lg p-3">
                                <h5 className="font-bold text-sm mb-2 flex items-center gap-2"><Calendar size={14}/> タイムライン</h5>
                                <p className="text-xs text-slate-500">
                                    全体の流れを視覚的に確認できます。<br/>
                                    <span className="text-green-600 font-bold">緑</span>: 希望通りぴったり<br/>
                                    <span className="text-amber-500 font-bold">黄</span>: 時間が少しずれている<br/>
                                    <span className="text-red-500 font-bold">赤</span>: 日程違い / 希望外
                                </p>
                            </div>
                            <div className="border rounded-lg p-3">
                                <h5 className="font-bold text-sm mb-2 flex items-center gap-2"><CheckCircle2 size={14}/> 手動編集リスト</h5>
                                <p className="text-xs text-slate-500">
                                    画面下部のリストで、個別の「開始時間」や「持ち時間」を直接入力して変更できます。変更はリアルタイムに重複チェック（<AlertTriangle size={10} className="inline text-red-500"/>）されます。
                                </p>
                            </div>
                        </div>
                    </section>

                </div>
                
                {/* Footer */}
                <div className="p-4 border-t bg-slate-50 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        閉じる
                    </button>
                </div>
            </div>
        </div>
    );
};
