import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, RotateCcw, Upload, Download, AlertTriangle, 
  Settings, Calendar, BarChart3, Edit3, X, Check, Trash2, Plus
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { SchedulerLogic, Band, Solution, Request, CostParams } from './scheduler/logic';

// Utility
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ------------------------------------------------------------------
// Components
// ------------------------------------------------------------------

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("bg-white border rounded-xl shadow-sm", className)}>{children}</div>
);

const Button = ({ children, variant="primary", className, disabled, onClick }: any) => {
  const base = "px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    outline: "border border-slate-300 text-slate-700 hover:bg-slate-50",
    ghost: "text-slate-500 hover:bg-slate-100",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
  };
  return (
    <button className={cn(base, variants[variant as keyof typeof variants], className)} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
};

// ------------------------------------------------------------------
// Main App
// ------------------------------------------------------------------

export default function App() {
  // View State
  const [activeView, setActiveView] = useState<'dashboard' | 'data'>('dashboard');

  // Config State
  const [days, setDays] = useState(2);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("18:00");
  const [intervalMin] = useState(0);

  // Advanced Settings State
  const [costParams, setCostParams] = useState<Partial<CostParams>>({
    PENALTY_OVERLAP: 100000,
    PENALTY_UNASSIGNED: 50000,
    PENALTY_OUTSIDE_PREF: 4000,
    PRIORITY_COST_1: 0,
    PRIORITY_COST_2: 300,
    PRIORITY_COST_3: 900,
    PENALTY_OVERFLOW: 100,
    PENALTY_EQUITY: 1,
  });

  // Data State
  const [bands, setBands] = useState<Band[]>([]);
  const [solution, setSolution] = useState<Solution>({});
  const [durations, setDurations] = useState<Record<string, number>>({});
  
  // Optimization State
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [, setReductionLevel] = useState(1.0);
  const [currentScore, setCurrentScore] = useState(0);

  // Logic Instance
  const schedulerRef = useRef<SchedulerLogic | null>(null);

  // Initialize Logic
  useEffect(() => {
    schedulerRef.current = new SchedulerLogic(startTime, endTime, days, intervalMin, costParams);
  }, [days, startTime, endTime, intervalMin, costParams]);

  // Demo Data Generator
  const loadDemoData = () => {
    // Determine 2 indices for 120min bands
    const allIndices = Array.from({length: 20}, (_, i) => i);
    // Shuffle
    for (let i = allIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
    }
    const longDurationIndices = new Set(allIndices.slice(0, 2));

    const newBands: Band[] = Array.from({ length: 20 }).map((_, i) => {
      let duration;
      if (longDurationIndices.has(i)) {
          // 2 groups: 120min
          duration = 120; 
      } else {
          // Others: 30, 45, 60 preferred
          const options = [30, 30, 45, 45, 45, 60, 60];
          duration = options[Math.floor(Math.random() * options.length)];
      }

      const requests: Request[] = [];
      for (let r = 0; r < 3; r++) {
        const d = Math.floor(Math.random() * days) + 1;
        // Random hour between start + offset
        const h = 10 + Math.floor(Math.random() * 6); 
        const m = Math.random() > 0.5 ? "00" : "30";
        requests.push({ day: d, start: `${h}:${m}` });
      }
      return {
        id: i + 1,
        name: `Band ${String.fromCharCode(65 + (i % 26))}${i + 1}`,
        duration_min: duration,
        requests
      };
    });
    setBands(newBands);
    setSolution({});
    setDurations({});
    setStatusMessage("デモデータを読み込みました");
  };

  // CSV Parsers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          // Simple CSV Parse: Name, Duration, Day1, Time1, Day2, Time2...
          const lines = text.split('\n');
          const newBands: Band[] = [];
          lines.forEach((line, idx) => {
              if (idx === 0) return; // Skip header
              const cols = line.split(',').map(c => c.trim());
              if (cols.length < 2) return;
              
              const requests: Request[] = [];
              // Try to parse pairs
              for(let i=2; i<cols.length; i+=2) {
                  const d = parseInt(cols[i]);
                  const t = cols[i+1];
                  if (!isNaN(d) && t) {
                      requests.push({ day: d, start: t });
                  }
              }

              newBands.push({
                  id: Date.now() + idx,
                  name: cols[0],
                  duration_min: parseInt(cols[1]) || 30,
                  requests
              });
          });
          if (newBands.length > 0) {
              setBands(all => [...all, ...newBands]);
              setStatusMessage(`${newBands.length}件のデータを追加しました`);
          }
      };
      reader.readAsText(file);
  };

  const addNewBand = () => {
      const newBand: Band = {
          id: Date.now(),
          name: "新規団体",
          duration_min: 30,
          requests: [{ day: 1, start: "10:00" }]
      };
      setBands([...bands, newBand]);
  };

  const updateBand = (id: string | number, field: keyof Band, value: any) => {
      setBands(bands.map(b => b.id === id ? { ...b, [field]: value } : b));
  };

  const updateRequest = (bandId: string | number, reqIdx: number, field: keyof Request, value: any) => {
      setBands(bands.map(b => {
          if (b.id !== bandId) return b;
          const newReqs = [...b.requests];
          if (!newReqs[reqIdx]) newReqs[reqIdx] = { day: 1, start: "10:00" };
          newReqs[reqIdx] = { ...newReqs[reqIdx], [field]: value };
          return { ...b, requests: newReqs };
      }));
  };

  const removeBand = (id: string | number) => {
      setBands(bands.filter(b => b.id !== id));
  };

  // ----------------------------------------------------------------
  // Optimization Loop (Client Side SA)
  // ----------------------------------------------------------------
  
  const runOptimization = async () => {
    if (!schedulerRef.current || bands.length === 0) return;
    
    setIsOptimizing(true);
    setProgress(0);
    setReductionLevel(1.0);
    
    const logic = schedulerRef.current;
    
    // Initial Durations (5min slots)
    let currentDurations: Record<string, number> = {};
    bands.forEach(b => {
      currentDurations[String(b.id)] = Math.floor(b.duration_min / 5);
    });

    // Helper: Async SA Wrapper to unblock UI
    const runSAAsync = async (
        initialSol: Solution | null, 
        currentDurs: Record<string, number>, 
        iterations: number, 
        startTemp: number,
        cb?: (i: number, cost: number) => void
    ) => {
        return new Promise<{ bestSol: Solution, bestCost: number }>((resolve) => {
            let currentSolution = initialSol ? JSON.parse(JSON.stringify(initialSol)) : {};
            
            // Random Init if no solution
            if (!initialSol) {
                bands.forEach(b => {
                    const bid = String(b.id);
                    const day = Math.floor(Math.random() * logic.days);
                    const dur = currentDurs[bid];
                    const maxStart = logic.dailySlots - dur;
                    if (maxStart >= 0) {
                        currentSolution[bid] = {
                            day,
                            start: Math.floor(Math.random() * (maxStart + 1))
                        };
                    } else {
                        currentSolution[bid] = null;
                    }
                });
            }

            let { cost: currentCost } = logic.calculateCost(currentSolution, bands, currentDurs);
            let bestSolution = JSON.parse(JSON.stringify(currentSolution));
            let bestCost = currentCost;

            let i = 0;
            const batchSize = 1000;
            
            const step = () => {
                const end = Math.min(i + batchSize, iterations);
                for (; i < end; i++) {
                    // Update Temp
                    let temp = startTemp * (1 - (i / iterations));
                    if (temp <= 0.001) temp = 0.001;

                    // Neighbor
                    const neighborSolution = { ...currentSolution }; // Shallow copy sufficient for 1-level depth change? No, need deeper for specific key
                    const bandIds = bands.map(b => String(b.id));
                    const targetBid = bandIds[Math.floor(Math.random() * bandIds.length)];
                    
                    if (Math.random() < 0.5) {
                        // Move
                        const newDay = Math.floor(Math.random() * logic.days);
                        const dur = currentDurs[targetBid];
                        const maxStart = logic.dailySlots - dur;
                        if (maxStart >= 0) {
                            neighborSolution[targetBid] = {
                                day: newDay,
                                start: Math.floor(Math.random() * (maxStart + 1))
                            };
                        }
                    } else {
                        // Swap
                        const targetBid2 = bandIds[Math.floor(Math.random() * bandIds.length)];
                        if (targetBid !== targetBid2) {
                            const b1 = neighborSolution[targetBid];
                            const b2 = neighborSolution[targetBid2];
                            if (b1 && b2) {
                                const d1 = currentDurs[targetBid];
                                const d2 = currentDurs[targetBid2];
                                // Check bounds
                                if ((b2.start + d1 <= logic.dailySlots) && (b1.start + d2 <= logic.dailySlots)) {
                                    neighborSolution[targetBid] = { ...b2, start: b2.start }; // keep day/start struct
                                    neighborSolution[targetBid2] = { ...b1, start: b1.start };
                                }
                            }
                        }
                    }

                    const { cost: neighborCost } = logic.calculateCost(neighborSolution, bands, currentDurs);
                    const delta = neighborCost - currentCost;
                    
                    if (delta < 0 || Math.random() < Math.exp(-delta / temp)) {
                        currentSolution = neighborSolution;
                        currentCost = neighborCost;
                        if (currentCost < bestCost) {
                            bestSolution = JSON.parse(JSON.stringify(currentSolution));
                            bestCost = currentCost;
                        }
                    }
                }

                if (cb) cb(i, bestCost);

                if (i < iterations) {
                    // Continue next frame
                    setTimeout(step, 0);
                } else {
                    resolve({ bestSol: bestSolution, bestCost });
                }
            };
            step();
        });
    };

    // Main Loop
    let reduction = 1.0;
    const maxAttempts = 12;
    let finalSolution = {};
    let finalDurs = { ...currentDurations };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        setStatusMessage(`試行 ${attempt}/${maxAttempts} (短縮率: ${Math.round((1 - reduction) * 100)}%)...`);
        
        // 50000 -> 100000 to match Python
        const { bestSol } = await runSAAsync(null, finalDurs, 100000, 50, (i, c) => {
            if (i % 5000 === 0) setProgress((i / 100000) * 100);
            setCurrentScore(Math.floor(c));
        });

        // Check Feasibility
        const noUnassigned = Object.values(bestSol).every(v => v !== null);
        const { grid } = logic.calculateCost(bestSol, bands, finalDurs);
        let noOverlap = true;
        for (let d = 0; d < logic.days; d++) {
            for (let t = 0; t < logic.dailySlots; t++) {
                if (grid[d][t] > 1) {
                    noOverlap = false;
                    break;
                }
            }
        }

        if (noUnassigned && noOverlap) {
            setStatusMessage("解決策発見！仕上げ中...");
            // Polishing (also 100000)
            const { bestSol: polishedSol, bestCost: polishedCost } = await runSAAsync(bestSol, finalDurs, 100000, 20);
            
            finalSolution = polishedSol;
            setCurrentScore(Math.floor(polishedCost));
            setStatusMessage(`完了! スコア: ${Math.floor(polishedCost)}`);
            break;
        }

        // Retry with reduction
        if (attempt < maxAttempts) {
            reduction *= 0.9;
            setReductionLevel(reduction);
            // Apply reduction
            for (const b of bands) {
                const bid = String(b.id);
                const reducedFloat = b.duration_min * reduction;
                // Round to nearest 5
                let newMin = Math.round(reducedFloat / 5) * 5;
                if (newMin < 5) newMin = 5;
                finalDurs[bid] = Math.floor(newMin / 5);
            }
        } else {
             finalSolution = bestSol;
             setStatusMessage("条件を満たす解が見つかりませんでした (最大試行到達)");
        }
    }

    setSolution(finalSolution);
    setDurations(finalDurs);
    setIsOptimizing(false);
  };


  // ----------------------------------------------------------------
  // Render Helpers
  // ----------------------------------------------------------------
  
  // Timeline Components
  const Timeline = () => {
    if (!schedulerRef.current) return null;
    const logic = schedulerRef.current;
    
    return (
        <div className="space-y-8">
            {Array.from({ length: logic.days }).map((_, dayIdx) => (
                <div key={dayIdx} className="bg-slate-50 p-4 rounded-xl border">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Calendar size={20} className="text-blue-600"/> 
                        Day {dayIdx + 1}
                    </h3>
                    
                    <div className="relative h-24 bg-white border rounded-lg overflow-hidden flex">
                        {/* Time Grid Background */}
                        <div className="absolute inset-0 flex pointer-events-none">
                            {Array.from({ length: logic.dailySlots }).map((_, i) => (
                                <div key={i} className="flex-1 border-r border-slate-100" />
                            ))}
                        </div>

                        {/* Bands */}
                        {bands.map((band) => {
                            const bid = String(band.id);
                            const assignment = solution[bid];
                            if (!assignment || assignment.day !== dayIdx) return null;

                            const startPercent = (assignment.start / logic.dailySlots) * 100;
                            const duration = durations[bid] || 0;
                            const widthPercent = (duration / logic.dailySlots) * 100;
                            
                            // Determine Color & Status
                            let colorClass = "bg-green-500";
                            
                            // Check Preference Logic (with Detailed Tooltip)
                            const deviations: string[] = [];
                            let hasOverlapWithAny = false;

                            band.requests.forEach((req, idx) => {
                                const reqStart = logic.timeStrToIdx(req.start);
                                const reqEnd = reqStart + (Math.floor(band.duration_min / 5)); // Original requested duration
                                
                                // Intersection Check
                                // Assignment: [assignment.start, assignment.start + duration]
                                // Request:    [reqStart, reqEnd] (on req.day-1)
                                
                                const isSameDay = (req.day - 1) === dayIdx;
                                if (isSameDay) {
                                    const overlapStart = Math.max(assignment.start, reqStart);
                                    const overlapEnd = Math.min(assignment.start + duration, reqEnd);
                                    
                                    if (overlapStart < overlapEnd) {
                                        hasOverlapWithAny = true;
                                    }

                                    // Calculate diff (Starts)
                                    const diffIdx = assignment.start - reqStart;
                                    const diffMin = diffIdx * 5;
                                    
                                    if (diffMin === 0) {
                                        deviations.push(`★ 第${idx + 1}希望: ピッタリ`);
                                    } else {
                                        const sign = diffMin > 0 ? "+" : "";
                                        deviations.push(`第${idx + 1}希望から: ${sign}${diffMin}分`);
                                    }
                                } else {
                                     deviations.push(`第${idx + 1}希望: 日程違い (Day${req.day})`);
                                }
                            });
                            
                            // Color Logic
                            const isExact = deviations.some(s => s.includes("ピッタリ"));
                            
                            if (isExact) {
                                colorClass = "bg-green-500"; // Exact Match
                            } else if (hasOverlapWithAny) {
                                colorClass = "bg-amber-400"; // Overlaps but switched/shifted
                            } else {
                                colorClass = "bg-red-500";   // No overlap with ANY preference
                            }
                            
                            // Note: if no requests at all, what color? Green? Grey?
                            if (band.requests.length === 0) colorClass = "bg-slate-400";

                            const tooltipText = `${band.name}\n` + 
                                                `${logic.idxToTimeStr(assignment.start)} - ${logic.idxToTimeStr(assignment.start + duration)}\n` +
                                                `元々の持ち時間: ${band.duration_min}分\n` + 
                                                `----------------\n` +
                                                deviations.join('\n');

                            return (
                                <div
                                    key={band.id}
                                    className={cn(
                                        "absolute top-2 bottom-2 rounded-md shadow-sm border border-white/20 text-white text-xs font-bold flex items-center justify-center cursor-help transition-all hover:brightness-110",
                                        colorClass
                                    )}
                                    style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                                    title={tooltipText}
                                >
                                    <span className="truncate px-1">{band.name}</span>
                                </div>
                            );
                        })}
                    </div>
                    {/* Time Scale */}
                    <div className="flex justify-between text-xs text-slate-400 mt-1 px-1">
                        <span>{startTime}</span>
                        <span>{endTime}</span>
                    </div>
                </div>
            ))}
        </div>
    );
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans">
      
      {/* Sidebar */}
      <aside className="w-80 bg-white border-r flex flex-col shrink-0">
        <div className="p-6 border-b">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <BarChart3  className="fill-blue-600 text-blue-600"/>
                大学祭ステージ自動割当
            </h1>
            <p className="text-xs text-slate-500 mt-1">Timetable Optimizer</p>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-8">
            {/* 1. Admin Config */}
            <section className="space-y-4">
                <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider">基本設定</h2>
                <div className="space-y-3">
                    <label className="block text-sm">
                        <span className="text-slate-600 font-medium">開催日数</span>
                        <input type="number" value={days} onChange={e => setDays(Number(e.target.value))} 
                            className="w-full mt-1 px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"/>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block text-sm">
                            <span className="text-slate-600 font-medium">開始</span>
                            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} 
                                className="w-full mt-1 px-2 py-2 border rounded-md text-sm text-center"/>
                        </label>
                        <label className="block text-sm">
                            <span className="text-slate-600 font-medium">終了</span>
                            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} 
                                className="w-full mt-1 px-2 py-2 border rounded-md text-sm text-center"/>
                        </label>
                    </div>
                </div>
            </section>

        {/* 2. Data Navigation */}
         <section className="space-y-4">
               <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider">データ管理</h2>
                <div className="grid grid-cols-2 gap-2">
                     <Button 
                         variant={activeView === 'dashboard' ? 'primary' : 'outline'} 
                         className="w-full" 
                         onClick={() => setActiveView('dashboard')}
                     >
                        <BarChart3 size={14} /> ダッシュボード
                     </Button>
                     <Button
                         variant={activeView === 'data' ? 'primary' : 'outline'}
                         className="w-full"
                         onClick={() => setActiveView('data')}
                     >
                        <Edit3 size={14} /> データ入力
                     </Button>
                </div>
            </section>

        {/* 3. Optimization Action */}
            <section className="space-y-4 border-t pt-4">
                 <details className="group">
                    <summary className="text-xs font-bold uppercase text-slate-400 tracking-wider cursor-pointer flex items-center justify-between list-none">
                        詳細設定 (パラメータ)
                        <Settings size={14} className="group-open:rotate-90 transition-transform"/>
                    </summary>
                    <div className="mt-4 space-y-3 pl-1">
                        <label className="block text-xs">
                            <span className="text-slate-600">重複ペナルティ</span>
                            <input type="number" value={costParams.PENALTY_OVERLAP} 
                                onChange={e => setCostParams(p => ({...p, PENALTY_OVERLAP: Number(e.target.value)}))}
                                className="w-full mt-1 px-2 py-1 border rounded text-xs"/>
                        </label>
                         <label className="block text-xs">
                            <span className="text-slate-600">未割当ペナルティ</span>
                            <input type="number" value={costParams.PENALTY_UNASSIGNED} 
                                onChange={e => setCostParams(p => ({...p, PENALTY_UNASSIGNED: Number(e.target.value)}))}
                                className="w-full mt-1 px-2 py-1 border rounded text-xs"/>
                        </label>
                         <label className="block text-xs">
                            <span className="text-slate-600">希望外ペナルティ</span>
                            <input type="number" value={costParams.PENALTY_OUTSIDE_PREF} 
                                onChange={e => setCostParams(p => ({...p, PENALTY_OUTSIDE_PREF: Number(e.target.value)}))}
                                className="w-full mt-1 px-2 py-1 border rounded text-xs"/>
                        </label>
                        <div className="grid grid-cols-3 gap-1">
                             <label className="block text-xs">
                                <span className="text-slate-600">第1</span>
                                <input type="number" value={costParams.PRIORITY_COST_1} 
                                    onChange={e => setCostParams(p => ({...p, PRIORITY_COST_1: Number(e.target.value)}))}
                                    className="w-full mt-1 px-1 py-1 border rounded text-xs"/>
                            </label>
                            <label className="block text-xs">
                                <span className="text-slate-600">第2</span>
                                <input type="number" value={costParams.PRIORITY_COST_2} 
                                    onChange={e => setCostParams(p => ({...p, PRIORITY_COST_2: Number(e.target.value)}))}
                                    className="w-full mt-1 px-1 py-1 border rounded text-xs"/>
                            </label>
                            <label className="block text-xs">
                                <span className="text-slate-600">第3</span>
                                <input type="number" value={costParams.PRIORITY_COST_3} 
                                    onChange={e => setCostParams(p => ({...p, PRIORITY_COST_3: Number(e.target.value)}))}
                                    className="w-full mt-1 px-1 py-1 border rounded text-xs"/>
                            </label>
                        </div>
                         <label className="block text-xs">
                            <span className="text-slate-600">公平性 (Equity)</span>
                            <input type="number" value={costParams.PENALTY_EQUITY} 
                                onChange={e => setCostParams(p => ({...p, PENALTY_EQUITY: Number(e.target.value)}))}
                                className="w-full mt-1 px-2 py-1 border rounded text-xs"/>
                        </label>
                         <label className="block text-xs">
                            <span className="text-slate-600">はみ出しペナルティ</span>
                            <input type="number" value={costParams.PENALTY_OVERFLOW} 
                                onChange={e => setCostParams(p => ({...p, PENALTY_OVERFLOW: Number(e.target.value)}))}
                                className="w-full mt-1 px-2 py-1 border rounded text-xs"/>
                        </label>
                    </div>
                 </details>
            </section>
        </div>

        {/* 3. Optimization Action */}
        <div className="p-6 border-t bg-slate-50">
            <Button className="w-full py-4 text-base shadow-lg shadow-blue-200" onClick={runOptimization} disabled={isOptimizing}>
                {isOptimizing ? (
                    <span className="animate-pulse">最適化中...</span>
                ) : (
                    <>
                        <Play size={18} className="fill-current" /> 自動割当開始
                    </>
                )}
            </Button>
            {isOptimizing && (
                <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-600">
                        <span>Progress</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                    <p className="text-xs text-slate-500 text-center">{statusMessage}</p>
                </div>
            )}
             {!isOptimizing && currentScore > 0 && (
                <div className="mt-3 text-center">
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                        最終スコア: {currentScore}
                    </span>
                </div>
            )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto space-y-8">
            
            {activeView === 'data' ? (
                // --- Data Entry View ---
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-slate-800">データ入力・編集</h2>
                        <div className="flex gap-2">
                             <div className="relative">
                                <Button variant="outline" className="relative overflow-hidden">
                                     <Upload size={16} className="mr-2"/> CSV読込
                                     <input type="file" accept=".csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
                                </Button>
                             </div>
                             <Button variant="outline" onClick={loadDemoData}><RotateCcw size={16} className="mr-2"/> デモデータ</Button>
                             <Button variant="danger" onClick={() => setBands([])}><X size={16} className="mr-2"/> 全削除</Button>
                        </div>
                    </div>

                    <Card className="overflow-hidden">
                        <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700">登録団体リスト ({bands.length}件)</h3>
                            <Button onClick={addNewBand} variant="primary" className="py-1 px-3 text-xs"><Plus size={12} className="mr-1"/> 新規追加</Button>
                        </div>
                        <div className="overflow-x-auto max-h-[600px]">
                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead className="bg-slate-50 text-slate-500 font-medium border-b sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="px-4 py-3 w-16">ID</th>
                                        <th className="px-4 py-3 min-w-[200px]">団体名</th>
                                        <th className="px-4 py-3 w-32">持ち時間</th>
                                        <th className="px-4 py-3">希望日程1</th>
                                        <th className="px-4 py-3">希望日程2</th>
                                        <th className="px-4 py-3">希望日程3</th>
                                        <th className="px-4 py-3 w-16">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {bands.map((band) => (
                                        <tr key={band.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-2 text-xs text-slate-400 font-mono">{band.id}</td>
                                            <td className="px-4 py-2">
                                                <input className="border rounded px-2 py-1 w-full" value={band.name} onChange={e => updateBand(band.id, 'name', e.target.value)} />
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-1">
                                                    <input className="border rounded px-2 py-1 w-16 text-right" type="number" step="5" value={band.duration_min} onChange={e => updateBand(band.id, 'duration_min', parseInt(e.target.value))} />
                                                    <span className="text-xs text-slate-500">分</span>
                                                </div>
                                            </td>
                                            {/* Requests (0..2) */}
                                            {[0, 1, 2].map(i => {
                                                const req = band.requests[i] || { day: 1, start: "" };
                                                return (
                                                    <td key={i} className="px-4 py-2">
                                                        <div className="flex gap-1 items-center">
                                                             <select className="border rounded px-1 py-1 text-xs" value={req.day} onChange={e => updateRequest(band.id, i, 'day', parseInt(e.target.value))}>
                                                                 {/* Just show 1..days, maybe up to 5 just in case */}
                                                                 {[1,2,3,4,5].map(d => (
                                                                     <option key={d} value={d}>Day{d}</option>
                                                                 ))}
                                                             </select>
                                                             <input type="time" className="border rounded px-1 py-1 text-xs w-24" value={req.start} onChange={e => updateRequest(band.id, i, 'start', e.target.value)}/>
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                            <td className="px-4 py-2 text-center">
                                                <button onClick={() => removeBand(band.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors" title="削除">
                                                    <Trash2 size={16}/>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {bands.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Upload size={32} className="opacity-20"/>
                                                    <p>右上のボタンからCSVを読み込むか、デモデータをロードしてください</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            ) : (
            // --- Dashboard View ---
            <>
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">ステージ管理ダッシュボード</h2>
                    <p className="text-slate-500">出演スケジュールの編集と制約チェック</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline"><Settings size={16}/> 設定</Button>
                    <Button variant="outline"><Download size={16}/> エクスポート</Button>
                </div>
            </div>

            {/* Timeline */}
            <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg text-slate-700">タイムライン (Gantt)</h3>
                    <div className="flex gap-3 text-xs">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-sm"></div> 希望通り</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-400 rounded-sm"></div> 希望内(ズレ)</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm"></div> 希望外</div>
                    </div>
                </div>
                <div className="min-h-[200px]">
                    {bands.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                            <Calendar size={48} className="mb-4 opacity-20"/>
                            <p>データがありません。</p>
                        </div>
                    ) : (
                        <Timeline />
                    )}
                </div>
            </Card>

            {/* Smart Grid (Schedule Editor) */}
            <Card className="overflow-hidden">
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">割当状況リスト</h3>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-500">
                             {bands.length > 0 ? (
                                 Object.values(solution).filter(Boolean).length === bands.length 
                                 ? "全団体割当済" 
                                 : "未割当あり"
                             ) : "データなし"}
                        </span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b">
                            <tr>
                                <th className="px-4 py-3">団体名</th>
                                <th className="px-4 py-3 w-32">演奏時間 (分)</th>
                                <th className="px-4 py-3 w-32">日程</th>
                                <th className="px-4 py-3 w-32">開始時間</th>
                                <th className="px-4 py-3">状態</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {bands.map((band) => {
                                const bid = String(band.id);
                                const sol = solution[bid];
                                const dur = durations[bid] ?? Math.floor(band.duration_min/5);
                                const logic = schedulerRef.current;
                                
                                // Validation Check for this row
                                if (sol && logic) {
                                    // Overlap check? 
                                    // We need to check against OTHER bands
                                    // Ideally this is pre-calculated for the whole solution
                                    // validationErrors[bid]
                                }

                                return (
                                    <tr key={band.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-800">
                                            {band.name}
                                            <div className="text-xs text-slate-400 mt-0.5">Orig: {band.duration_min}m</div>
                                        </td>
                                        
                                        {/* Duration Input */}
                                        <td className="px-4 py-3">
                                            <input 
                                                type="number" 
                                                step="5"
                                                min="5"
                                                className="w-20 px-2 py-1 border rounded text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={dur * 5}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value) || 5;
                                                    setDurations(prev => ({ ...prev, [bid]: Math.floor(val/5) }));
                                                }}
                                            />
                                        </td>

                                        {/* Day Select */}
                                        <td className="px-4 py-3">
                                            <select 
                                                className="w-full px-2 py-1 border rounded text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={sol ? sol.day : ""}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setSolution(prev => {
                                                        const next = { ...prev };
                                                        if (val === "") {
                                                            next[bid] = null;
                                                        } else {
                                                            // Keep start time if exists, else default 0
                                                            const d = parseInt(val);
                                                            const s = next[bid]?.start ?? 0;
                                                            next[bid] = { day: d, start: s };
                                                        }
                                                        return next;
                                                    });
                                                }}
                                            >
                                                <option value="">(Unassigned)</option>
                                                {logic && Array.from({ length: logic.days }).map((_, i) => (
                                                    <option key={i} value={i}>Day {i+1}</option>
                                                ))}
                                            </select>
                                        </td>

                                        {/* Start Time Input */}
                                        <td className="px-4 py-3">
                                            <input 
                                                type="time" 
                                                className={cn(
                                                    "w-full px-2 py-1 border rounded text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none",
                                                    !sol && "opacity-50 pointer-events-none"
                                                )}
                                                value={sol && logic ? logic.idxToTimeStr(sol.start) : ""}
                                                onChange={(e) => {
                                                    if (!logic || !sol) return;
                                                    const tStr = e.target.value;
                                                    const idx = logic.timeStrToIdx(tStr);
                                                    if (idx !== -1) {
                                                        setSolution(prev => ({
                                                            ...prev,
                                                            [bid]: { ...sol, start: idx }
                                                        }));
                                                    }
                                                }}
                                            />
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 py-3">
                                           {(() => {
                                               if (!logic || !sol) return <span className="text-xs text-slate-400">Not Scheduled</span>;
                                               
                                               // Simple Real-time Validation
                                               // Check overlap with others
                                               let hasOverlap = false;
                                               const myStart = sol.start;
                                               const myEnd = sol.start + dur; // intervals? logic handles interval in grid, here we check raw overlap often
                                               
                                               // Check bounds
                                               if (myStart < 0 || myEnd > logic.dailySlots) {
                                                    return <span className="text-xs text-red-600 font-bold flex items-center gap-1"><AlertTriangle size={12}/> Out of bounds</span>
                                               }

                                               // O(N) check for demo
                                               for (const otherBand of bands) {
                                                   if (otherBand.id === band.id) continue;
                                                   const otherSol = solution[String(otherBand.id)];
                                                   if (otherSol && otherSol.day === sol.day) {
                                                       const otherDur = durations[String(otherBand.id)] ?? Math.floor(otherBand.duration_min/5);
                                                       // Simple overlap
                                                       const oStart = otherSol.start;
                                                       const oEnd = oStart + otherDur + logic.intervalSlots; // include interval buffer?
                                                       const mStart = myStart; 
                                                       const mEnd = myEnd + logic.intervalSlots;
                                                       
                                                       if (Math.max(mStart, oStart) < Math.min(mEnd, oEnd)) {
                                                           hasOverlap = true;
                                                           break;
                                                       }
                                                   }
                                               }

                                               if (hasOverlap) {
                                                   return <span className="text-xs text-red-600 font-bold flex items-center gap-1 bg-red-50 px-2 py-1 rounded"><AlertTriangle size={12}/> Overlap!</span>
                                               }
                                               
                                               return <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><Check size={14}/> OK</span>
                                           })()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {bands.length === 0 && (
                        <div className="p-8 text-center text-slate-400 text-sm">Table is empty</div>
                    )}
                </div>
            </Card>
            </>
            )}

        </div>
      </main>
    </div>
  );
}
