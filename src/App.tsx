import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, RotateCcw, Upload, AlertTriangle, 
  Settings, Calendar, BarChart3, Edit3, X, Check, Trash2, Plus, HelpCircle, Download
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { SchedulerLogic, Band, Solution, Request, CostParams } from './scheduler/logic';
import { UsageGuide } from './UsageGuide';

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
  const [dailyConfig, setDailyConfig] = useState<{ start: string, end: string }[]>(
    Array(2).fill({ start: "10:00", end: "18:00" })
  );
  const [intervalMin] = useState(0);

  // Advanced Settings State
  const [costParams, setCostParams] = useState<Partial<CostParams>>({
    PENALTY_OVERLAP: 100000,
    PENALTY_UNASSIGNED: 50000,
    PENALTY_OUTSIDE_PREF: 100000,
    PRIORITY_COST_1: 0,
    PRIORITY_COST_2: 500,
    PRIORITY_COST_3: 1000,
    PENALTY_OVERFLOW: 100,
    PENALTY_EQUITY: 1,
  });

  // Data State
  const [bands, setBands] = useState<Band[]>([]);
  const [solution, setSolution] = useState<Solution>({});
  const [durations, setDurations] = useState<Record<string, number>>({});
  
  // Drag State
  const [dragState, setDragState] = useState<{
    type: 'move' | 'resize',
    bandId: string,
    startX: number,
    initialStartIdx: number,
    initialDayIdx: number,
    initialDuration: number,
  } | null>(null);
  
  const dayRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
     dayRefs.current = dayRefs.current.slice(0, days);
  }, [days]);

  // Handle Drag Events
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
        if (!schedulerRef.current) return;
        const logic = schedulerRef.current;
        
        let targetDayIdx = dragState.initialDayIdx;
        let targetRect: DOMRect | null = null;
        
        // Check which day we are over
        dayRefs.current.forEach((el, idx) => {
            if (el) {
                const rect = el.getBoundingClientRect();
                // Expanded hit area for better UX
                if (e.clientX >= rect.left && e.clientX <= rect.right && 
                    e.clientY >= rect.top - 20 && e.clientY <= rect.bottom + 20) {
                    targetDayIdx = idx;
                    targetRect = rect;
                }
            }
        });

        // Fallback to initial day if dragging strictly or resize or no target found
        if (dragState.type === 'resize' || targetRect === null) {
            targetDayIdx = dragState.initialDayIdx;
            const el = dayRefs.current[targetDayIdx];
            if (el) targetRect = el.getBoundingClientRect();
        }
        
        if (!targetRect) return;

        const dayConfig = logic.dailyConfigs[targetDayIdx];
        if (!dayConfig) return;
        
        const slots = dayConfig.slots;
        const width = targetRect.width;
        const slotPx = width / slots;
        
        if (dragState.type === 'move') {
             // Calculate effective cursor position relative to the slot grid
             const sourceDayEl = dayRefs.current[dragState.initialDayIdx];
             if (!sourceDayEl) return;
             
             const sourceRect = sourceDayEl.getBoundingClientRect();
             const sourceSlotPx = sourceRect.width / logic.dailyConfigs[dragState.initialDayIdx].slots;
             
             // Offset of the click relative to the band start
             // clickX - (TrackStart + BandStartPx)
             const clickOffsetPx = dragState.startX - (sourceRect.left + (dragState.initialStartIdx * sourceSlotPx));
             const clickOffsetSlots = Math.round(clickOffsetPx / slotPx); 

             const currentMouseRelativeX = e.clientX - targetRect.left;
             const currentMouseSlot = Math.round(currentMouseRelativeX / slotPx);
             
             let newStart = currentMouseSlot - clickOffsetSlots;
             // Use initialDuration for boundary check during move
             const dur = dragState.initialDuration;
             
             newStart = Math.max(0, Math.min(newStart, slots - dur));

             setSolution(prev => {
                const current = prev[dragState.bandId];
                if (current && current.day === targetDayIdx && current.start === newStart) return prev;
                return { ...prev, [dragState.bandId]: { day: targetDayIdx, start: newStart } };
             });

        } else if (dragState.type === 'resize') {
             const startSlotPx = targetRect.width / slots; // Recalc specific to this day
             const deltaX = e.clientX - dragState.startX;
             const deltaSlots = Math.round(deltaX / startSlotPx);
             
             let newDuration = dragState.initialDuration + deltaSlots;
             newDuration = Math.max(1, newDuration); // Min 5 mins
             
             if (dragState.initialStartIdx + newDuration > slots) {
                 newDuration = slots - dragState.initialStartIdx;
             }
             
             setDurations(prev => {
                 if (prev[dragState.bandId] === newDuration) return prev;
                 return { ...prev, [dragState.bandId]: newDuration };
             });
        }
    };

    const handleMouseUp = () => {
        setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, days]);
  
  // Optimization State
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [resultStatus, setResultStatus] = useState<{ type: 'success' | 'date_error' | 'failure', message?: string } | null>(null);
  const [reductionRate, setReductionRate] = useState(0); // 0-100%
  const [, setCurrentScore] = useState(0);
  const [allowOutsidePreference, setAllowOutsidePreference] = useState(false); // Default false
  const [saTrials, setSaTrials] = useState(100);
  const [showGuide, setShowGuide] = useState(false);

  // Logic Instance
  const schedulerRef = useRef<SchedulerLogic | null>(null);

  // Initialize Logic
  useEffect(() => {
    schedulerRef.current = new SchedulerLogic(dailyConfig, intervalMin, costParams);
  }, [dailyConfig, intervalMin, costParams]);

  // Sync dailyConfig when days changes
  const handleDaysChange = (newDays: number) => {
      setDays(newDays);
      setDailyConfig(prev => {
          if (prev.length === newDays) return prev;
          if (prev.length < newDays) {
              const last = prev[prev.length - 1] || { start: "10:00", end: "18:00" };
              const append = Array(newDays - prev.length).fill({ ...last });
              return [...prev, ...append];
          } else {
              return prev.slice(0, newDays);
          }
      });
  };
  
  const updateDailyConfig = (dayIdx: number, field: 'start' | 'end', val: string) => {
    setDailyConfig(prev => prev.map((c, i) => i === dayIdx ? { ...c, [field]: val } : c));
  };


  // Demo Data Generator
  const loadDemoData = () => {
    const allIndices = Array.from({length: 20}, (_, i) => i);
    for (let i = allIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
    }
    const longDurationIndices = new Set(allIndices.slice(0, 2));

    const newBands: Band[] = Array.from({ length: 20 }).map((_, i) => {
      let duration;
      if (longDurationIndices.has(i)) {
          duration = 120; 
      } else {
          const options = [30, 30, 45, 45, 45, 60, 60];
          duration = options[Math.floor(Math.random() * options.length)];
      }

      const requests: Request[] = [];
      for (let r = 0; r < 3; r++) {
        const d = Math.floor(Math.random() * days) + 1;
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
          const lines = text.split('\n');
          const newBands: Band[] = [];
          lines.forEach((line, idx) => {
              if (idx === 0) return; // Skip header
              const cols = line.split(',').map(c => c.trim());
              if (cols.length < 2) return;
              
              const requests: Request[] = [];
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

  // Export CSV
  const handleExportCSV = () => {
      if (!bands.length) return;
      
      const logic = schedulerRef.current;
      if (!logic) return;

      // Header
      const header = ["ID", "団体名", "決定日程", "開始時間", "終了時間", "持ち時間(分)"];
      const rows = bands.map(b => {
          const bid = String(b.id);
          const sol = solution[bid];
          const dur = (durations[bid] ?? Math.floor(b.duration_min/5)) * 5;
          
          let dayStr = "";
          let startStr = "";
          let endStr = "";

          if (sol) {
              dayStr = `Day${sol.day + 1}`;
              startStr = logic.idxToTimeStr(sol.start, sol.day);
              endStr = logic.idxToTimeStr(sol.start + (dur/5), sol.day);
          }

          return [
              b.id,
              b.name,
              dayStr,
              startStr,
              endStr,
              dur
          ].join(",");
      });

      const csvContent = "\uFEFF" + [header.join(","), ...rows].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `timetable_export_${new Date().toISOString().slice(0,19).replace(/[-:T]/g,"")}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // Download Template
  const handleDownloadTemplate = () => {
      const header = "団体名,持ち時間,第1希望日,第1希望時間,第2希望日,第2希望時間,第3希望日,第3希望時間\n";
      const example = "バンドA,30,1,10:00,1,12:00,,\nバンドB,45,1,13:00,,,1,15:00\nバンドC,60,2,10:00,2,14:00,,\n";
      // Add BOM for Excel compatibility
      const blob = new Blob(["\uFEFF" + header + example], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "template.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // ----------------------------------------------------------------
  // Optimization Loop (Client Side SA)
  // ----------------------------------------------------------------
  
  const runOptimization = async (overrideReductionRate?: number) => {
    if (!schedulerRef.current || bands.length === 0) return;
    
    setIsOptimizing(true);
    setProgress(0);
    setResultStatus(null);
    setCurrentScore(0);
    
    let currentDurations: Record<string, number> = {};
    const effectiveReductionRate = overrideReductionRate ?? reductionRate;
    const reductionFactor = (100 - effectiveReductionRate) / 100;
    
    bands.forEach(b => {
      // Logic: time = round2.5( max(30, original * rate) )
      const reducedVal = Math.max(30, b.duration_min * reductionFactor);
      
      // 2.4捨2.5入 (Round to nearest 5, ties round up)
      // Math.round(x) rounds .5 up to next integer, which is exactly what we want for x/5
      const finalMin = Math.round(reducedVal / 5) * 5;
      
      currentDurations[String(b.id)] = finalMin / 5;
    });

    const setupConfig = {
        dailyConfigs: dailyConfig,
        intervalMin,
        costParams
    };

    setStatusMessage(`がんばっています (0/${saTrials})`);

    const progressMap = new Array(saTrials).fill(0);
    let completedCount = 0;
    let lastUiUpdate = 0;

    const updateAggregateProgress = (idx: number, p: number) => {
        progressMap[idx] = p;
        const now = Date.now();
        if (now - lastUiUpdate > 100) {
            const total = progressMap.reduce((a, b) => a + b, 0);
            setProgress(total / saTrials);
            lastUiUpdate = now;
        }
    };

    const runWorker = (idx: number): Promise<{ solution: Solution, cost: number, outsideCount: number }> => {
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('./scheduler/worker.ts', import.meta.url), { type: 'module' });
            
            worker.onmessage = (e) => {
                const { type, progress: p, score, result, error } = e.data;
                if (type === 'progress') {
                   updateAggregateProgress(idx, p);
                   if (idx === 0) setCurrentScore(Math.floor(score));
                } else if (type === 'done') {
                    worker.terminate();
                    completedCount++;
                    setStatusMessage(`がんばっています (${completedCount}/${saTrials})`);
                    resolve(result);
                } else if (type === 'error') {
                    worker.terminate();
                    console.error("Worker Error:", error);
                    reject(error);
                }
            };

            worker.postMessage({
                id: idx,
                bands,
                currentDurs: currentDurations,
                setup: setupConfig
            });
        });
    };

    try {
        const concurrency = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) 
            ? Math.max(1, navigator.hardwareConcurrency - 1) 
            : 4;

        const candidates: { solution: Solution, cost: number, outsideCount: number }[] = [];
        const queue = Array.from({ length: saTrials }, (_, i) => i);

        const workerThread = async () => {
             while (queue.length > 0) {
                 const idx = queue.shift();
                 if (idx === undefined) break;
                 try {
                     const res = await runWorker(idx);
                     candidates.push(res);
                 } catch (e) {
                     console.error(`Trial ${idx} failed`, e);
                 }
             }
        };

        const activeWorkers = Array.from({ length: Math.min(concurrency, saTrials) }, () => workerThread());
        await Promise.all(activeWorkers);

        const logic = schedulerRef.current;
        const validCandidates = candidates.filter(cand => {
            const noUnassigned = Object.values(cand.solution).every(v => v !== null);
            if (!noUnassigned) return false;
            
            const { grid } = logic.calculateCost(cand.solution, bands, currentDurations);
            let noOverlap = true;
            for (let d = 0; d < logic.days; d++) {
                const daySlots = logic.dailyConfigs[d]?.slots || 0;
                for (let t = 0; t < daySlots; t++) {
                    if (grid[d][t] > 1) {
                        noOverlap = false;
                        break;
                    }
                }
            }
            return noOverlap;
        });

        const acceptableCandidates = validCandidates.filter(c => {
            if (!allowOutsidePreference && c.outsideCount > 0) return false;
            return true;
        });
        
        if (acceptableCandidates.length === 0) {
            setResultStatus({ type: 'failure' });
            setIsOptimizing(false);
            return;
        }

        acceptableCandidates.sort((a, b) => {
            if (a.outsideCount !== b.outsideCount) {
                return a.outsideCount - b.outsideCount;
            }
            return a.cost - b.cost;
        });

        const best = acceptableCandidates[0];
        setSolution(best.solution);
        setDurations(currentDurations);
        setCurrentScore(Math.floor(best.cost));
        setStatusMessage("完了");
        setResultStatus({ type: 'success' });
        
    } catch (err) {
        console.error(err);
        setStatusMessage("エラーが発生しました");
        setResultStatus({ type: 'failure' });
    } finally {
        setIsOptimizing(false);
    }
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
            {Array.from({ length: logic.days }).map((_, dayIdx) => {
                const dayConfig = logic.dailyConfigs[dayIdx];
                if (!dayConfig) return null;
                const dailySlots = dayConfig.slots;

                return (
                <div key={dayIdx} className="bg-slate-50 p-4 rounded-xl border">
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <Calendar size={20} className="text-blue-600"/> 
                        Day {dayIdx + 1}
                        <span className="text-xs text-slate-400 font-normal ml-2">
                            {Math.floor(dayConfig.startMin / 60)}:{String(dayConfig.startMin % 60).padStart(2, '0')} - {Math.floor(dayConfig.endMin / 60)}:{String(dayConfig.endMin % 60).padStart(2, '0')}
                        </span>
                    </h3>
                    
                    <div 
                        ref={el => { dayRefs.current[dayIdx] = el; }}
                        className="relative h-24 bg-white border rounded-lg mb-8"
                    >
                        {/* Time Grid Background & Labels */}
                        <div className="absolute inset-0 pointer-events-none">
                            {Array.from({ length: dailySlots + 1 }).map((_, i) => {
                                const min = dayConfig.startMin + i * 5;
                                if (min % 30 !== 0) return null;
                                
                                const left = (i / dailySlots) * 100;
                                const isHour = min % 60 === 0;
                                
                                return (
                                    <React.Fragment key={i}>
                                        <div 
                                            className={cn("absolute top-0 bottom-0 border-l", isHour ? "border-slate-300" : "border-slate-100 border-dashed")} 
                                            style={{ left: `${left}%` }}
                                        />
                                        {isHour && (
                                            <div 
                                                className="absolute top-full mt-2 text-xs text-slate-400 font-medium -translate-x-1/2 whitespace-nowrap" 
                                                style={{ left: `${left}%` }}
                                            >
                                                {Math.floor(min / 60)}:00
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>

                        {/* Bands */}
                        {bands.map((band) => {
                            const bid = String(band.id);
                            const assignment = solution[bid];
                            if (!assignment || assignment.day !== dayIdx) return null;

                            const startPercent = (assignment.start / dailySlots) * 100;
                            const duration = durations[bid] ?? Math.floor(band.duration_min/5);
                            const widthPercent = (duration / dailySlots) * 100;
                            
                            const isDragging = dragState?.bandId === bid;
                            
                            let colorClass = "bg-green-500";
                            const deviations: string[] = [];
                            let hasOverlapWithAny = false;

                            band.requests.forEach((req, idx) => {
                                const reqStart = logic.timeStrToIdx(req.start, req.day - 1);
                                if (reqStart === -1) {
                                    deviations.push(`★ 第${idx + 1}希望: 時間外??`);
                                    return;
                                }

                                const reqEnd = reqStart + (Math.floor(band.duration_min / 5)); 
                                const isSameDay = (req.day - 1) === dayIdx;
                                
                                if (isSameDay) {
                                    const overlapStart = Math.max(assignment.start, reqStart);
                                    const overlapEnd = Math.min(assignment.start + duration, reqEnd);
                                    
                                    if (overlapStart < overlapEnd) {
                                        hasOverlapWithAny = true;
                                    }

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
                            
                            const isExact = deviations.some(s => s.includes("ピッタリ"));
                            
                            if (isExact) {
                                colorClass = "bg-green-500"; 
                            } else if (hasOverlapWithAny) {
                                colorClass = "bg-amber-400"; 
                            } else {
                                colorClass = "bg-red-500";   
                            }
                            
                            if (band.requests.length === 0) colorClass = "bg-slate-400";

                            const tooltipText = `${band.name}\n` + 
                                                `${logic.idxToTimeStr(assignment.start, dayIdx)} - ${logic.idxToTimeStr(assignment.start + duration, dayIdx)}\n` +
                                                `希望持ち時間: ${band.duration_min}分\n` + 
                                                `----------------\n` +
                                                deviations.join('\n');

                            return (
                                <div
                                    key={band.id}
                                    className={cn(
                                        "absolute top-2 bottom-2 rounded-md shadow-sm border border-white/20 text-white text-xs font-bold flex items-center justify-center transition-all hover:brightness-110",
                                        colorClass,
                                        isDragging ? "cursor-grabbing z-50 shadow-lg scale-105 opacity-90" : "cursor-grab",
                                        dragState && !isDragging && "opacity-50"
                                    )}
                                    style={{ 
                                        left: `${startPercent}%`, 
                                        width: `${widthPercent}%`,
                                        zIndex: isDragging ? 50 : 10
                                    }}
                                    title={tooltipText}
                                    onMouseDown={(e) => {
                                        if (e.button !== 0) return;
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setDragState({
                                            type: 'move',
                                            bandId: bid,
                                            startX: e.clientX,
                                            initialStartIdx: assignment.start,
                                            initialDayIdx: assignment.day,
                                            initialDuration: duration
                                        });
                                    }}
                                >
                                    <span className="truncate px-1 select-none pointer-events-none">{band.name}</span>
                                    
                                    {/* Resize Handle */}
                                    <div 
                                        className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize hover:bg-black/10 flex items-center justify-center group"
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            setDragState({
                                                type: 'resize',
                                                bandId: bid,
                                                startX: e.clientX,
                                                initialStartIdx: assignment.start,
                                                initialDayIdx: assignment.day,
                                                initialDuration: duration
                                            });
                                        }}
                                    >
                                        <div className="h-4 w-1 bg-white/30 rounded-full group-hover:bg-white/50" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )})}
        </div>
    );
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans relative">
      <UsageGuide isOpen={showGuide} onClose={() => setShowGuide(false)} />
      
      {/* Sidebar */}
      <aside className="w-80 bg-white border-r flex flex-col shrink-0">
        <div className="p-6 border-b">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <BarChart3  className="fill-blue-600 text-blue-600"/>
                大学祭ステージ自動割当
            </h1>
            <div className="flex justify-between items-center mt-1">
                <p className="text-xs text-slate-500">Timetable Optimizer</p>
                <button onClick={() => setShowGuide(true)} className="text-blue-600 hover:text-blue-800 text-xs font-bold underline flex items-center gap-1">
                    <HelpCircle size={12}/> 使い方
                </button>
            </div>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-8">
            {/* 1. Admin Config */}
            <section className="space-y-4">
                <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider">基本設定</h2>
                <div className="space-y-3">
                    <label className="block text-sm">
                        <span className="text-slate-600 font-medium">開催日数</span>
                        <input type="number" min="1" max="10" value={days} onChange={e => handleDaysChange(Number(e.target.value))} 
                            className="w-full mt-1 px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"/>
                    </label>
                    <div className="space-y-2">
                        {dailyConfig.map((conf, i) => (
                            <div key={i} className="flex gap-2 items-center bg-slate-50 p-2 rounded">
                                <span className="text-xs font-bold text-slate-500 w-8">Day{i+1}</span>
                                <input type="time" value={conf.start} onChange={e => updateDailyConfig(i, 'start', e.target.value)} 
                                    className="w-full px-1 py-1 border rounded text-xs text-center"/>
                                <span className="text-slate-400">-</span>
                                <input type="time" value={conf.end} onChange={e => updateDailyConfig(i, 'end', e.target.value)} 
                                    className="w-full px-1 py-1 border rounded text-xs text-center"/>
                            </div>
                        ))}
                    </div>
                    
                    <label className="block text-sm pt-2 border-t border-slate-100">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-slate-600 font-medium">全体の時間短縮</span>
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{reductionRate}%短縮</span>
                        </div>
                        <input type="range" min="0" max="50" step="5" value={reductionRate} 
                           onChange={e => setReductionRate(Number(e.target.value))}
                           className="w-full accent-blue-600 cursor-pointer"/>
                       <span className="text-[10px] text-slate-400 block mt-1">
                           例: 60分→{Math.max(5, Math.round(Math.floor(60 * (100 - reductionRate)/100)/5)*5)}分, 
                           45分→{Math.max(5, Math.round(Math.floor(45 * (100 - reductionRate)/100)/5)*5)}分, 
                           30分→{Math.max(5, Math.round(Math.floor(30 * (100 - reductionRate)/100)/5)*5)}分
                       </span>
                    </label>
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
                            <span className="text-slate-600 font-medium">試行パターン数 (Trials)</span>
                             <input type="number" min="1" max="1000" value={saTrials} 
                                onChange={e => setSaTrials(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-full mt-1 px-2 py-1 border rounded text-xs"/>
                        </label>
                        
                        <div className="flex items-center gap-2 mt-2">
                             <input type="checkbox" id="allowOutside" 
                                checked={allowOutsidePreference} 
                                onChange={e => setAllowOutsidePreference(e.target.checked)}
                                className="rounded border-slate-300"/>
                             <label htmlFor="allowOutside" className="text-xs text-slate-600 font-medium">希望外(赤)を許可する</label>
                        </div>
                        <div className="my-2 border-t border-slate-100"></div>

                        <div className="mb-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">優先度スコア設定 (ペナルティ)</div>

                        <label className="block text-xs">
                            <span className="text-slate-600">重複NG</span>
                            <input type="number" value={costParams.PENALTY_OVERLAP} 
                                onChange={e => setCostParams(p => ({...p, PENALTY_OVERLAP: Number(e.target.value)}))}
                                className="w-full mt-1 px-2 py-1 border rounded text-xs"/>
                        </label>
                         <label className="block text-xs">
                            <span className="text-slate-600">未割当NG</span>
                            <input type="number" value={costParams.PENALTY_UNASSIGNED} 
                                onChange={e => setCostParams(p => ({...p, PENALTY_UNASSIGNED: Number(e.target.value)}))}
                                className="w-full mt-1 px-2 py-1 border rounded text-xs"/>
                        </label>
                         <label className="block text-xs">
                            <span className="text-slate-600">希望外発生</span>
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
            <Button className="w-full py-4 text-base shadow-lg shadow-blue-200" onClick={() => runOptimization()} disabled={isOptimizing}>
                {isOptimizing ? (
                    <span className="animate-pulse">考え中...</span>
                ) : (
                    <>
                        <Play size={18} className="fill-current" /> スケジュールを作成
                    </>
                )}
            </Button>
            {isOptimizing && (
                <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-600">
                        <span>進捗状況</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                    <p className="text-xs text-slate-500 text-center">{statusMessage}</p>
                </div>
            )}
            
            {/* Result Status Display */}
            {!isOptimizing && resultStatus?.type === 'failure' && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs space-y-2 text-red-700">
                    <p className="font-bold flex items-center gap-1"><AlertTriangle size={14}/> うまくいきませんでした</p>
                    <div className="pl-1 border-l-2 border-red-200 ml-1">
                        <p className="font-bold mb-1 text-red-600">ヒント:</p>
                        <ul className="list-disc list-inside space-y-1 opacity-90">
                            <li>枠が足りないようです。上に移動した<b>時間短縮</b>スライダーを動かしてみましょう。</li>
                            <li>偶然見つからなかっただけかもしれません。<b>再トライ</b>してみてください。</li>
                            <li>条件が厳しすぎるかも。「<b>希望外(赤)を許可</b>」をオンにしてみましょう。</li>
                        </ul>
                        <div className="mt-2 text-center">
                            <Button variant="danger" className="w-full py-1" onClick={() => {
                                const newRate = Math.min(reductionRate + 10, 50);
                                setReductionRate(newRate);
                                runOptimization(newRate);
                            }}>
                                <RotateCcw size={14} /> 時間を10%短縮して再トライ ({Math.min(reductionRate + 10, 50)}%)
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {!isOptimizing && resultStatus?.type === 'success' && (
                <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 text-center">
                    <p className="font-bold flex items-center justify-center gap-1"><Check size={14}/> スケジュール完成！</p>
                </div>
            )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-5xl mx-auto space-y-8">
            
            {activeView === 'data' ? (
                // --- Data Entry View ---
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-slate-800">データ入力・編集</h2>
                        <div className="flex gap-2">
                             <Button variant="ghost" onClick={handleDownloadTemplate} className="text-slate-500 hover:text-blue-600 text-xs">
                                 テンプレートDL
                             </Button>
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
                    <h2 className="text-2xl font-bold text-slate-800">スケジュール確認・調整</h2>
                    <p className="text-slate-500">自動作成されたスケジュールの確認と微調整ができます</p>
                </div>
                <div>
                     <Button variant="outline" onClick={handleExportCSV} disabled={bands.length === 0}>
                        <Download size={16} className="mr-2"/> 結果をCSV保存
                     </Button>
                </div>
            </div>

            {/* Timeline */}
            <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg text-slate-700">全体スケジュール表</h3>
                    <div className="flex gap-3 text-xs">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-sm"></div> バッチリ希望通り</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-400 rounded-sm"></div> おしい(時間ズレ)</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm"></div> 残念(日程違い)</div>
                    </div>
                </div>
                <div className="min-h-[200px]">
                    {bands.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                            <Calendar size={48} className="mb-4 opacity-20"/>
                            <p>まだデータがありません。「データ入力」から追加してください。</p>
                        </div>
                    ) : (
                        <Timeline />
                    )}
                </div>
            </Card>

            {/* Smart Grid (Schedule Editor) */}
            <Card className="overflow-hidden">
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">詳細リスト・手動調整</h3>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-500">
                             {bands.length > 0 ? (
                                 Object.values(solution).filter(Boolean).length === bands.length 
                                 ? "全員場所決まりました" 
                                 : "まだ決まっていない人がいます"
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
                                <th className="px-4 py-3">チェック</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {bands.map((band) => {
                                const bid = String(band.id);
                                const sol = solution[bid];
                                const dur = durations[bid] ?? Math.floor(band.duration_min/5);
                                const logic = schedulerRef.current;
                                
                                return (
                                    <tr key={band.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-800">
                                            {band.name}
                                            <div className="text-xs text-slate-400 mt-0.5">希望: {band.duration_min}分</div>
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
                                                <option value="">(未定)</option>
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
                                                value={sol && logic ? logic.idxToTimeStr(sol.start, sol.day) : ""}
                                                onChange={(e) => {
                                                    if (!logic || !sol) return;
                                                    const tStr = e.target.value;
                                                    const idx = logic.timeStrToIdx(tStr, sol.day);
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
                                               if (!logic || !sol) return <span className="text-xs text-slate-400">ー</span>;
                                               
                                               let hasOverlap = false;
                                               const myStart = sol.start;
                                               const myEnd = sol.start + dur; 
                                               
                                               const daySlots = logic.dailyConfigs[sol.day]?.slots || 0;
                                               if (myStart < 0 || myEnd > daySlots) {
                                                    return <span className="text-xs text-red-600 font-bold flex items-center gap-1"><AlertTriangle size={12}/> 時間外です</span>
                                               }

                                               for (const otherBand of bands) {
                                                   if (otherBand.id === band.id) continue;
                                                   const otherSol = solution[String(otherBand.id)];
                                                   if (otherSol && otherSol.day === sol.day) {
                                                       const otherDur = durations[String(otherBand.id)] ?? Math.floor(otherBand.duration_min/5);
                                                       const oStart = otherSol.start;
                                                       const oEnd = oStart + otherDur + logic.intervalSlots; 
                                                       const mStart = myStart; 
                                                       const mEnd = myEnd + logic.intervalSlots;
                                                       
                                                       if (Math.max(mStart, oStart) < Math.min(mEnd, oEnd)) {
                                                           hasOverlap = true;
                                                           break;
                                                       }
                                                   }
                                               }

                                               if (hasOverlap) {
                                                   return <span className="text-xs text-red-600 font-bold flex items-center gap-1 bg-red-50 px-2 py-1 rounded"><AlertTriangle size={12}/> かぶってます！</span>
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
                        <div className="p-8 text-center text-slate-400 text-sm">データがありません</div>
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
