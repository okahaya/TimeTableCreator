import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Upload, AlertTriangle, 
  Settings, Calendar, BarChart3, X, Check, Trash2, Plus, HelpCircle, Download
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
  // View State (Step-based)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Config State
  const [days, setDays] = useState(2);
  const [eventDates, setEventDates] = useState<string[]>(Array(2).fill(""));

  // Stage Config
  type StageConfig = {
      id: string;
      name: string;
      dailyTimes: { start: string, end: string }[];
      reductionRate: number;
      intervalMin: number;
  }
  const [stages, setStages] = useState<StageConfig[]>([
    { 
      id: "stage-0", 
      name: "奏", 
      dailyTimes: Array(2).fill({ start: "10:00", end: "19:00" }),
      reductionRate: 0,
      intervalMin: 5
    },
    { 
      id: "stage-1", 
      name: "宙", 
      dailyTimes: Array(2).fill({ start: "10:00", end: "19:00" }),
      reductionRate: 0,
      intervalMin: 5
    }
  ]);
  const [activeStageId, setActiveStageId] = useState<string>("stage-0");
  
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
  // bands now include assignedStageId
  const [bands, setBands] = useState<(Band & { assignedStageId: string })[]>([]);
  const [solution, setSolution] = useState<Solution>({});
  const [durations, setDurations] = useState<Record<string, number>>({});
  
  // Drag State
  const [dragState, setDragState] = useState<{
    type: 'move' | 'resize',
    bandId: string,
    startY: number,
    initialStartIdx: number,
    initialDayIdx: number,
    initialDuration: number,
    dragStageId?: string
  } | null>(null);
  
  // Ref for day columns: { [stageId]: [div, div, ...] }
  const dayRefs = useRef<Record<string, (HTMLDivElement | null)[]>>({});

  // Initialize dayRefs
  useEffect(() => {
     stages.forEach(s => {
         if (!dayRefs.current[s.id]) {
            dayRefs.current[s.id] = [];
         }
         // ensure length matches days (grow/shrink)
         dayRefs.current[s.id] = dayRefs.current[s.id].slice(0, days);
         while(dayRefs.current[s.id].length < days) {
           dayRefs.current[s.id].push(null);
         }
     });
  }, [days, stages]);

  // Handle Drag Events
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
        let targetDayIdx = dragState.initialDayIdx;
        let targetRect: DOMRect | null = null;
        let targetStageId = dragState.dragStageId || activeStageId;
        
        let found = false;
        
        // Check all visible stages logic
        // For Step 4 (All visible) drag
        Object.entries(dayRefs.current).forEach(([sId, cols]) => {
            if (found) return;
             cols.forEach((el, idx) => {
                if (el) {
                    const rect = el.getBoundingClientRect();
                    // Expanded hit area
                     if (e.clientX >= rect.left && e.clientX <= rect.right && 
                        e.clientY >= rect.top - 20 && e.clientY <= rect.bottom + 20) {
                        targetDayIdx = idx;
                        targetStageId = sId;
                        targetRect = rect;
                        found = true;
                    }
                }
            });
        });

        // Fallback
        if (dragState.type === 'resize' || targetRect === null) {
            targetDayIdx = dragState.initialDayIdx;
            targetStageId = dragState.dragStageId || activeStageId;
            const el = dayRefs.current[targetStageId]?.[targetDayIdx];
            if (el) targetRect = el.getBoundingClientRect();
        }
        
        // Logic lookup
        const logic = schedulerRefs.current[targetStageId];
        if (!targetRect || !logic) return;

        const dayConfig = logic.dailyConfigs[targetDayIdx];
        if (!dayConfig) return;
        
        const slots = dayConfig.slots;
        const height = targetRect.height;
        const slotPx = height / slots;
        
        if (dragState.type === 'move') {
             const sourceStageId = dragState.dragStageId || activeStageId;
             const sourceDayEl = dayRefs.current[sourceStageId]?.[dragState.initialDayIdx];
             if (!sourceDayEl) return;
             
             const sourceLogic = schedulerRefs.current[sourceStageId];
             if (!sourceLogic) return;

             const sourceRect = sourceDayEl.getBoundingClientRect();
             const sourceSlotPx = sourceRect.height / sourceLogic.dailyConfigs[dragState.initialDayIdx].slots;
             
             const clickOffsetPx = dragState.startY - (sourceRect.top + (dragState.initialStartIdx * sourceSlotPx));
             const clickOffsetSlots = Math.round(clickOffsetPx / slotPx); 

             const currentMouseRelativeY = e.clientY - targetRect.top;
             const currentMouseSlot = Math.round(currentMouseRelativeY / slotPx);
             
             let newStart = currentMouseSlot - clickOffsetSlots;
             const dur = dragState.initialDuration;
             newStart = Math.max(0, Math.min(newStart, slots - dur));

             setSolution(prev => {
                const current = prev[dragState.bandId];
                if (current && current.day === targetDayIdx && current.start === newStart) return prev; // also check stage change?
                return { ...prev, [dragState.bandId]: { day: targetDayIdx, start: newStart } };
             });
             
             // Update stage mapping if changed (Direct manipulation)
             // This might cause re-renders during drag, but it's needed to show band in new column
             const bIdStr = String(dragState.bandId);
             setBands(all => {
                const b = all.find(x => String(x.id) === bIdStr);
                if (b && b.assignedStageId !== targetStageId) {
                    return all.map(x => String(x.id) === bIdStr ? { ...x, assignedStageId: targetStageId } : x);
                }
                return all;
             });

        } else if (dragState.type === 'resize') {
             // Resize only works within same stage for now
             const startSlotPx = targetRect.height / slots;
             const deltaY = e.clientY - dragState.startY;
             const deltaSlots = Math.round(deltaY / startSlotPx);
             
             let newDuration = dragState.initialDuration + deltaSlots;
             newDuration = Math.max(1, newDuration); 
             
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
  }, [dragState, days, activeStageId]);
  
  // Optimization State
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [resultStatus, setResultStatus] = useState<{ type: 'success' | 'date_error' | 'failure', message?: string } | null>(null);
  // Removed local reductionRate state in favor of stage-specific config
  const [, setCurrentScore] = useState(0);
  const [allowOutsidePreference, setAllowOutsidePreference] = useState(false); // Default false
  const [saTrials, setSaTrials] = useState(1000);
  const [showGuide, setShowGuide] = useState(false);

  // Undo/Redo History
  const [history, setHistory] = useState<{
      past: { solution: Solution; bands: any[]; durations: Record<string, number> }[];
      future: { solution: Solution; bands: any[]; durations: Record<string, number> }[];
  }>({ past: [], future: [] });

  const saveToHistory = () => {
      setHistory(prev => {
          const current = { solution: { ...solution }, bands: [...bands], durations: { ...durations } };
          const newPast = [...prev.past, current];
          if (newPast.length > 50) newPast.shift(); // Limit history
          return {
              past: newPast,
              future: []
          };
      });
  };

  const undo = () => {
      setHistory(prev => {
          if (prev.past.length === 0) return prev;
          const current = { solution, bands, durations }; // Snapshot current state before reverting
          const previous = prev.past[prev.past.length - 1];
          const newPast = prev.past.slice(0, -1);
          
          setSolution(previous.solution);
          setBands(previous.bands);
          setDurations(previous.durations);
          
          return {
              past: newPast,
              future: [current, ...prev.future]
          };
      });
  };

  const redo = () => {
      setHistory(prev => {
          if (prev.future.length === 0) return prev;
          const current = { solution, bands, durations };
          const next = prev.future[0];
          const newFuture = prev.future.slice(1);
          
          setSolution(next.solution);
          setBands(next.bands);
          setDurations(next.durations);

          return {
              past: [...prev.past, current],
              future: newFuture
          };
      });
  };

  // Keyboard Listener for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((currentStep === 3 || currentStep === 4) && (e.ctrlKey || e.metaKey)) {
            if (e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if (e.key === 'y') {
                e.preventDefault();
                redo();
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, solution, bands, durations, history]);

  // Logic Instance (Multi-stage)
  const schedulerRefs = useRef<Record<string, SchedulerLogic>>({});

  // Initialize Logic
  useEffect(() => {
    stages.forEach(stage => {
        // Construct detailed daily config
        const stageDailyConfigs = stage.dailyTimes.map((dt, i) => ({
            start: dt.start,
            end: dt.end,
            date: eventDates[i] || ""
        }));
        schedulerRefs.current[stage.id] = new SchedulerLogic(stageDailyConfigs, stage.intervalMin, costParams);
    });
  }, [stages, eventDates, costParams]);

  // Sync Fixed Bands to Solution immediately
  useEffect(() => {
      let changed = false;
      const nextSol = { ...solution };
      
      bands.forEach(band => {
          // Check if band is fixed
          if (band.isFixed && band.fixedDay !== undefined && band.fixedStartStr) {
              const sId = (band as any).assignedStageId;
              const logic = schedulerRefs.current[sId];
              
              // Only process if logic exists for that stage
              if (logic) {
                  const dayIdx = band.fixedDay - 1; // 1-based -> 0-based
                  const startIdx = logic.timeStrToIdx(band.fixedStartStr, dayIdx);
                  const bId = String(band.id);
                  const current = nextSol[bId];

                  // If valid time and (not assigned OR assigned differently)
                  if (startIdx !== -1) {
                      if (!current || current.day !== dayIdx || current.start !== startIdx) {
                          nextSol[bId] = { day: dayIdx, start: startIdx };
                          changed = true;
                      }
                  } else {
                      // If time is invalid (e.g. out of range), maybe we should unassign?
                      // But let's keep it safe. If invalid, maybe just don't display or warn?
                      // Ideally we unassign if it was assigned to a wrong place.
                      // For now, if we can't resolve idx, we do nothing or remove?
                      // Let's remove to be safe if it was previously set by fixed logic.
                      // But user might be typing... so maybe don't remove immediately?
                  }
              }
          } else {
             // If NOT fixed, we don't necessarily remove it from solution
             // because it might be a result of optimization.
             // BUT if it WAS fixed and user unchecked it, it stays in solution at that position
             // until re-optimized. That seems fine.
          }
      });
      
      if (changed) {
          setSolution(nextSol);
      }
  }, [bands, stages, eventDates]);

  // Sync dailyConfig when days changes
  const handleDaysChange = (newDays: number) => {
      setDays(newDays);
      setEventDates(prev => {
          const start = prev[0] || "";
          if (!start) return Array(newDays).fill("");
          
          // Calculate consecutive dates
          const dates: string[] = [];
          const base = new Date(start);
          for (let i = 0; i < newDays; i++) {
              const d = new Date(base);
              d.setDate(base.getDate() + i);
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              dates.push(`${y}-${m}-${day}`);
          }
          return dates;
      });

      // Also update all stages
      setStages(prev => prev.map(s => {
          let newTimes = [...s.dailyTimes];
          if (newTimes.length < newDays) {
               const last = newTimes[newTimes.length - 1] || { start: "10:00", end: "19:00" };
               newTimes = [...newTimes, ...Array(newDays - newTimes.length).fill({ ...last })];
          } else {
               newTimes = newTimes.slice(0, newDays);
          }
          return { ...s, dailyTimes: newTimes };
      }));
  };
  
  const updateStartDate = (val: string) => {
      if (!val) {
          setEventDates(Array(days).fill(""));
          return;
      }
      const dates: string[] = [];
      const base = new Date(val);
      for (let i = 0; i < days; i++) {
          const d = new Date(base);
          d.setDate(base.getDate() + i);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          dates.push(`${y}-${m}-${day}`);
      }
      setEventDates(dates);
  };

  const updateStageName = (id: string, name: string) => {
      setStages(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  };

  const updateStageTime = (sId: string, dIdx: number, field: 'start' | 'end', val: string) => {
      setStages(prev => prev.map(s => {
          if (s.id !== sId) return s;
          const newTimes = [...s.dailyTimes];
          newTimes[dIdx] = { ...newTimes[dIdx], [field]: val };
          return { ...s, dailyTimes: newTimes };
      }));
  };

  const setStageCount = (count: number) => {
      setStages(prev => {
          if (prev.length === count) return prev;
          if (prev.length < count) {
              const append = Array(count - prev.length).fill(0).map((_, i) => ({
                  id: `stage-${Date.now()}-${i}`,
                  name: `ステージ ${prev.length + i + 1}`,
                  dailyTimes: Array(days).fill({ start: "10:00", end: "19:00" }),
                  reductionRate: 0,
                  intervalMin: 5
              }));
              return [...prev, ...append];
          } else {
              return prev.slice(0, count);
          }
      });
  };


  // CSV Parsers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          const lines = text.split(/\r?\n/);
          const newBands: (Band & { assignedStageId: string })[] = [];

          const parseCSVLine = (line: string): string[] => {
              const result: string[] = [];
              let current = '';
              let inQuote = false;
              for (let i = 0; i < line.length; i++) {
                  const char = line[i];
                  if (char === '"') {
                      if (inQuote && line[i + 1] === '"') {
                          current += '"';
                          i++;
                      } else {
                          inQuote = !inQuote;
                      }
                  } else if (char === ',' && !inQuote) {
                      result.push(current);
                      current = '';
                  } else {
                      current += char;
                  }
              }
              result.push(current);
              return result.map(c => c.trim());
          };

          lines.forEach((line, idx) => {
              line = line.trim();
              if (!line) return;

              const cols = parseCSVLine(line);
              if (cols.length < 2) return;

              // Check if it's Survey Format (Col 3 matches "120分" etc.)
              // Survey Cols: [0]ID, [1]Name, [2]Stage, [3]Duration, [4]Time1, [5]Time2, [6]Time3, [7]Reason
              const isSurveyFormat = cols.length >= 7 && (cols[3] || "").endsWith("分");

              if (isSurveyFormat) {
                  // Survey Format
                  if (cols[1] === "団体名") return; // Skip Header if present

                  const name = cols[1];
                  const stageName = cols[2];
                  const durationStr = cols[3];
                  const duration = parseInt(durationStr.replace("分", "")) || 30;

                  // Stage Assignment
                  let assignedStageId = activeStageId;
                  const targetStage = stages.find(s => s.name === stageName);
                  if (targetStage) {
                      assignedStageId = targetStage.id;
                  }

                  // Requests Parsing
                  const requests: Request[] = [];
                  const timeCols = [cols[4], cols[5], cols[6]];
                  
                  timeCols.forEach(tStr => {
                      if (!tStr || tStr === "ー") return;
                      // Match "05月02日13:30~..."
                      const match = tStr.match(/(\d+)月(\d+)日(\d{1,2}:\d{2})/);
                      if (match) {
                          const month = match[1].padStart(2, '0');
                          const day = match[2].padStart(2, '0');
                          const time = match[3];
                          const md = `${month}-${day}`;
                          
                          // Find matching day index in eventDates
                          const dayIdx = eventDates.findIndex(ed => ed.endsWith(md));
                          if (dayIdx !== -1) {
                              requests.push({ day: dayIdx + 1, start: time });
                          }
                      }
                  });

                  newBands.push({
                      id: Date.now() + idx + Math.random(),
                      name,
                      duration_min: duration,
                      requests,
                      assignedStageId
                  });

              } else {
                  // Template Format
                  if (idx === 0) return; // Skip Header

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
                      requests,
                      assignedStageId: activeStageId
                  });
              }
          });
          if (newBands.length > 0) {
              setBands(all => [...all, ...newBands]);
              setStatusMessage(`${newBands.length}件のデータを追加しました`);
          }
      };
      reader.readAsText(file);
  };

  const addNewBand = () => {
      const newBand: Band & { assignedStageId: string } = {
          id: Date.now(),
          name: "新規団体",
          duration_min: 30,
          requests: [{ day: 1, start: "10:00" }],
          assignedStageId: activeStageId
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

      // Header
      const header = ["ID", "ステージ", "団体名", "決定日程", "開始時間", "終了時間", "持ち時間(分)"];
      const rows = bands.map(b => {
          const bid = String(b.id);
          const sol = solution[bid];
          const dur = (durations[bid] ?? Math.floor(b.duration_min/5)) * 5;
          const assignedStage = stages.find(s => s.id === b.assignedStageId);
          const logic = schedulerRefs.current[b.assignedStageId];
          
          let dayStr = "";
          let startStr = "";
          let endStr = "";

          if (sol) {
              dayStr = `Day${sol.day + 1}`;
               // Only format if logic exists for that stage
              if (logic) {
                  startStr = logic.idxToTimeStr(sol.start, sol.day);
                  endStr = logic.idxToTimeStr(sol.start + (dur/5), sol.day);
              }
          }

          return [
              b.id,
              assignedStage ? assignedStage.name : b.assignedStageId,
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
  
  const runOptimization = async (overrideReductionRate?: number, targetStageId?: string) => {
    const sId = targetStageId || activeStageId;  
    const logic = schedulerRefs.current[sId];
    // Filter bands for this stage
    const stageBands = bands.filter(b => b.assignedStageId === sId);
    const currentStage = stages.find(s => s.id === sId);

    if (!logic || stageBands.length === 0 || !currentStage) return;
    
    setIsOptimizing(true);
    setProgress(0);
    setResultStatus(null);
    setCurrentScore(0);
    setStatusMessage("");

    // Auto-adjust reduction rate if impossible
    const totalCapacityMin = logic.dailyConfigs.reduce((sum, d) => sum + (d.slots * 5), 0);
    const totalIntervalNeeded = Math.max(0, stageBands.length - logic.days) * (currentStage.intervalMin || 0);

    const calcTotalNeeded = (r: number) => {
        const factor = (100 - r) / 100;
        const totalDuration = stageBands.reduce((sum, b) => {
             if (b.isFixed) {
                 return sum + b.duration_min;
             }
             // New Logic: Special handling for 30min bands
             let reducedVal: number;
             if (b.duration_min <= 25) {
                 reducedVal = b.duration_min;
             } else if (b.duration_min === 30) {
                 // For 30min, stay 30 unless reduction rate > 40%, then 25
                 reducedVal = r > 40 ? 25 : 30;
             } else {
                 // Original logic for others
                 reducedVal = Math.max(25, b.duration_min * factor); 
             }
             return sum + (Math.round(reducedVal / 5) * 5);
        }, 0);
        return totalDuration + totalIntervalNeeded;
    };

    let effectiveReductionRate = overrideReductionRate ?? currentStage.reductionRate;

    // Initial check for capacity
    if (calcTotalNeeded(effectiveReductionRate) > totalCapacityMin) {
        for (let r = effectiveReductionRate; r <= 95; r += 5) {
             if (calcTotalNeeded(r) <= totalCapacityMin) {
                 effectiveReductionRate = r;
                 break;
             }
        }
    }
    
    let bestCompromise: { solution: Solution, cost: number, outsideCount: number, hasOverlap: boolean } | null = null;
    let bestCompromiseRate = effectiveReductionRate;
    let bestCompromiseDurations: Record<string, number> = {};

    try {
        // Retry Loop for Auto-Reduction
        // Loop until 80% reduction max (user friendly limit)
        const MAX_REDUCTION = 80;

        while (effectiveReductionRate <= MAX_REDUCTION) {
            // Update UI state indirectly via status message to avoid re-renders of the whole stage config
            setStatusMessage(`最適化を実行中... (短縮率: ${effectiveReductionRate}%)`);
            setStages(prev => prev.map(s => s.id === sId ? { ...s, reductionRate: effectiveReductionRate } : s));
            
            // Prepare Configs for this iteration
            let currentDurations: Record<string, number> = {};
            const reductionFactor = (100 - effectiveReductionRate) / 100;
            
            stageBands.forEach(b => {
                if (b.isFixed) {
                    currentDurations[String(b.id)] = Math.round(b.duration_min / 5);
                    return;
                }

                let reducedVal: number;
                if (b.duration_min <= 25) {
                     reducedVal = b.duration_min;
                } else if (b.duration_min === 30) {
                     reducedVal = effectiveReductionRate > 40 ? 25 : 30;
                } else {
                     reducedVal = Math.max(25, b.duration_min * reductionFactor);
                }
                const finalMin = Math.round(reducedVal / 5) * 5;
                currentDurations[String(b.id)] = finalMin / 5;
            });

            const setupConfig = {
                dailyConfigs: logic.dailyConfigs,
                intervalMin: currentStage.intervalMin,
                costParams
            };

            const progressMap = new Array(saTrials).fill(0);
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

            const runWorker = (idx: number, durs: typeof currentDurations, conf: typeof setupConfig): Promise<{ solution: Solution, cost: number, outsideCount: number, hasOverlap: boolean }> => {
                return new Promise((resolve, reject) => {
                    const worker = new Worker(new URL('./scheduler/worker.ts', import.meta.url), { type: 'module' });
                    
                    worker.onmessage = (e) => {
                        const { type, progress: p, score, result, error } = e.data;
                        if (type === 'progress') {
                           updateAggregateProgress(idx, p);
                           if (idx === 0) setCurrentScore(Math.floor(score)); // Show score of first worker
                        } else if (type === 'done') {
                            worker.terminate();
                            resolve(result);
                        } else if (type === 'error') {
                            worker.terminate();
                            console.error("Worker Error:", error);
                            reject(error);
                        }
                    };

                    worker.postMessage({
                        id: idx,
                        bands: stageBands,
                        currentDurs: durs,
                        setup: conf
                    });
                });
            };

            const concurrency = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) 
                ? Math.max(1, navigator.hardwareConcurrency - 1) 
                : 4;

            const candidates: { solution: Solution, cost: number, outsideCount: number, hasOverlap: boolean }[] = [];
            const queue = Array.from({ length: saTrials }, (_, i) => i);

            const workerThread = async () => {
                 while (queue.length > 0) {
                     const idx = queue.shift();
                     if (idx === undefined) break;
                     try {
                         const res = await runWorker(idx, currentDurations, setupConfig);
                         candidates.push(res);
                     } catch (e) {
                         console.error(`Trial ${idx} failed`, e);
                     }
                 }
            };

            const activeWorkers = Array.from({ length: Math.min(concurrency, saTrials) }, () => workerThread());
            await Promise.all(activeWorkers);

            // Filter Candidates
            const validCandidates = candidates.filter(c => !c.hasOverlap);

            if (validCandidates.length > 0) {
                 // Check for PERFECT solution (No Overlap, No Outside)
                 const perfectCandidates = validCandidates.filter(c => c.outsideCount === 0);
                 
                 if (perfectCandidates.length > 0) {
                     perfectCandidates.sort((a, b) => a.cost - b.cost);
                     const best = perfectCandidates[0];
                     
                     // Apply Perfect Solution
                     setSolution(prev => ({ ...prev, ...best.solution }));
                     setDurations(prev => ({ ...prev, ...currentDurations }));
                     setCurrentScore(Math.floor(best.cost));
                     saveToHistory();
                     
                     // Update Stage Config
                     setStages(prev => prev.map(s => s.id === sId ? { ...s, reductionRate: effectiveReductionRate } : s));

                     setStatusMessage(effectiveReductionRate > (currentStage.reductionRate || 0)
                        ? `持ち時間を短縮して解決しました (${effectiveReductionRate}%)` 
                        : "完了");
                     setResultStatus({ type: 'success' });
                     setIsOptimizing(false);
                     return;
                 }
                 
                 // No perfect solution, but we have valid ones (no overlap).
                 // Keep the best compromise found so far across all rates.
                 // We prefer Lower OutsideCount over Cost
                 validCandidates.sort((a, b) => a.outsideCount - b.outsideCount || a.cost - b.cost);
                 const currentBest = validCandidates[0];
                 
                 if (!bestCompromise || currentBest.outsideCount < bestCompromise.outsideCount) {
                     bestCompromise = currentBest;
                     bestCompromiseRate = effectiveReductionRate;
                     bestCompromiseDurations = currentDurations;
                 }
            }
            
            // If "Strict No Overlap" found nothing, OR only found "Outside Preference" solutions
            // Increase reduction rate and retry to see if we can fit better.
            effectiveReductionRate += 5;
        }

        // If loop finishes without perfect solution, use best compromise
        if (bestCompromise) {
            setStages(prev => prev.map(s => s.id === sId ? { ...s, reductionRate: bestCompromiseRate } : s));
            setSolution(prev => ({ ...prev, ...bestCompromise!.solution }));
            setDurations(prev => ({ ...prev, ...bestCompromiseDurations }));
            setCurrentScore(Math.floor(bestCompromise!.cost));
            saveToHistory();
            setStatusMessage(`重複なしの解が見つかりましたが、一部希望時間外が含まれます (短縮率: ${bestCompromiseRate}%, 希望外: ${bestCompromise!.outsideCount}件)`);
            setResultStatus({ type: 'success' }); // Theoretically success, but with warning
        } else {
            setStatusMessage("条件を満たす解が見つかりませんでした (要件緩和を検討してください)");
            setResultStatus({ type: 'failure' });
        }
        
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
  

  // ----------------------------------------------------------------
  // Render Helpers
  // ----------------------------------------------------------------
  
  // Timeline Components
  const Timeline = ({ stageId }: { stageId: string }) => {
    const logic = schedulerRefs.current[stageId];
    if (!logic) return null;

    const assignedBands = bands.filter(b => b.assignedStageId === stageId);
    
    const isCompact = currentStep === 4;

    return (
        <div className={cn("flex gap-4 items-start", !isCompact && "overflow-x-auto pb-4")}>
            {Array.from({ length: logic.days }).map((_, dayIdx) => {
                const dayConfig = logic.dailyConfigs[dayIdx];
                if (!dayConfig) return null;
                const dailySlots = dayConfig.slots;

                return (
                <div key={dayIdx} className={cn("bg-slate-50 p-4 rounded-xl border flex-1", !isCompact && "min-w-[300px]")}>
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <Calendar size={20} className="text-blue-600"/> 
                        Day {dayIdx + 1}
                        {dayConfig.date && <span className="text-base text-slate-500 font-medium">({dayConfig.date.slice(5)})</span>}
                        <span className="text-xs text-slate-400 font-normal ml-auto">
                            {Math.floor(dayConfig.startMin / 60)}:{String(dayConfig.startMin % 60).padStart(2, '0')} - {Math.floor(dayConfig.endMin / 60)}:{String(dayConfig.endMin % 60).padStart(2, '0')}
                        </span>
                    </h3>
                    
                    <div 
                        ref={el => { 
                             if (!dayRefs.current[stageId]) dayRefs.current[stageId] = [];
                             dayRefs.current[stageId][dayIdx] = el; 
                        }}
                        className="relative bg-white border rounded-lg mb-8 shadow-inner"
                        style={{ height: `${Math.max(600, dailySlots * 6)}px` }}
                    >
                        {/* Time Grid Background & Labels */}
                        <div className="absolute inset-0 pointer-events-none">
                            {Array.from({ length: dailySlots + 1 }).map((_, i) => {
                                const min = dayConfig.startMin + i * 5;
                                if (min % 30 !== 0) return null;
                                
                                const top = (i / dailySlots) * 100;
                                const isHour = min % 60 === 0;
                                
                                return (
                                    <React.Fragment key={i}>
                                        <div 
                                            className={cn("absolute left-0 right-0 border-t", isHour ? "border-slate-300" : "border-slate-100 border-dashed")} 
                                            style={{ top: `${top}%` }}
                                        />
                                        {isHour && (
                                            <div 
                                                className="absolute left-2 text-xs text-slate-400 font-medium -translate-y-1/2 bg-white/80 px-1 rounded z-0" 
                                                style={{ top: `${top}%` }}
                                            >
                                                {Math.floor(min / 60)}:00
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>

                        {/* Dragging Band Request Ghosts */}
                        {dragState && (() => {
                            const draggingBand = bands.find(b => String(b.id) === dragState.bandId);
                            if (!draggingBand) return null;

                            return draggingBand.requests.map((req, rIdx) => {
                                if ((req.day - 1) !== dayIdx) return null;
                                
                                const reqStartIdx = logic.timeStrToIdx(req.start, dayIdx);
                                if (reqStartIdx === -1) return null;
                                
                                const durationIdx = Math.floor(draggingBand.duration_min / 5);
                                const startPercent = (reqStartIdx / dailySlots) * 100;
                                const heightPercent = (durationIdx / dailySlots) * 100;

                                return (
                                    <div 
                                        key={`ghost-${rIdx}`}
                                        className="absolute left-2 right-2 bg-green-100/60 border-2 border-green-400 border-dashed rounded-md pointer-events-none z-0 flex items-start justify-end pr-2 pt-0.5"
                                        style={{ top: `${startPercent}%`, height: `${heightPercent}%` }}
                                    >
                                        <span className="text-[10px] text-green-700 font-bold opacity-80 bg-white/50 px-1 rounded">第{rIdx + 1}希望</span>
                                    </div>
                                );
                            });
                        })()}

                        {/* Bands */}
                        {assignedBands.map((band) => {
                            const bid = String(band.id);
                            const assignment = solution[bid];
                            if (!assignment || assignment.day !== dayIdx) return null;

                            const startPercent = (assignment.start / dailySlots) * 100;
                            const duration = durations[bid] ?? Math.floor(band.duration_min/5);
                            const heightPercent = (duration / dailySlots) * 100;
                            
                            const isDragging = dragState?.bandId === bid;
                            
                            let colorClass = "bg-green-500";
                            const deviations: string[] = [];
                            let hasOverlapWithAny = false;

                            // Calculate Union of Requests for Green Check
                            const allowedIntervals: [number, number][] = [];
                            band.requests.forEach(req => {
                                if ((req.day - 1) !== dayIdx) return;
                                const s = logic.timeStrToIdx(req.start, dayIdx);
                                if (s === -1) return;
                                const d = Math.floor(band.duration_min / 5); 
                                allowedIntervals.push([s, s + d]);
                            });
                            allowedIntervals.sort((a, b) => a[0] - b[0]);
                            const mergedIntervals: [number, number][] = [];
                            if (allowedIntervals.length > 0) {
                                let [currS, currE] = allowedIntervals[0];
                                for (let i = 1; i < allowedIntervals.length; i++) {
                                    const [nextS, nextE] = allowedIntervals[i];
                                    if (nextS <= currE) {
                                        currE = Math.max(currE, nextE);
                                    } else {
                                        mergedIntervals.push([currS, currE]);
                                        currS = nextS;
                                        currE = nextE;
                                    }
                                }
                                mergedIntervals.push([currS, currE]);
                            }
                            
                            const myEndIdx = assignment.start + duration;
                            const isFullyInsideUnion = mergedIntervals.some(([ms, me]) => assignment.start >= ms && myEndIdx <= me);
                            if (isFullyInsideUnion) {
                                deviations.push(`★ 希望範囲内(Union)`);
                            }
                            
                            // Check for conflict with other bands (in same stage)
                            let isConflict = false;
                            for (const otherBand of assignedBands) {
                                if (otherBand.id === band.id) continue;
                                const otherSol = solution[String(otherBand.id)];
                                if (otherSol && otherSol.day === dayIdx) {
                                    const otherDur = durations[String(otherBand.id)] ?? Math.floor(otherBand.duration_min/5);
                                    
                                    // Current drag/Band position
                                    let myStart = assignment.start;
                                    let myEnd = assignment.start + duration;
                                    
                                    // If this is the band being dragged, we might want to check the *drag* position if we were doing live conflict check
                                    // But currently 'assignment.start' is updated on drag end or during drag? 
                                    // In handleMouseMove, we update setSolution state live. So assignment.start IS the current drag position.
                                    
                                    // Check overlap
                                    if (Math.max(myStart, otherSol.start) < Math.min(myEnd, otherSol.start + otherDur)) {
                                        isConflict = true;
                                        deviations.push(`★ 他団体(${otherBand.name})と重複しています`);
                                    }
                                }
                            }

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

                                    // Check if fully inside the requested window
                                    const isFullyInside = (assignment.start >= reqStart) && ((assignment.start + duration) <= reqEnd);

                                    const diffIdx = assignment.start - reqStart;
                                    const diffMin = diffIdx * 5;
                                    
                                    if (isFullyInside) {
                                        const diffLabel = diffMin === 0 ? "ピッタリ" : `${Math.abs(diffMin)}分シフト`;
                                        deviations.push(`★ 第${idx + 1}希望: 範囲内 (${diffLabel})`);
                                    } else {
                                        const sign = diffMin > 0 ? "+" : "";
                                        deviations.push(`第${idx + 1}希望から: ${sign}${diffMin}分`);
                                    }
                                } else {
                                     deviations.push(`第${idx + 1}希望: 日程違い (Day${req.day})`);
                                }
                            });
                            
                            const isExact = deviations.some(s => s.includes("範囲内"));
                            
                            // If dragging, ignore conflict for color (show preference color)
                            // If dropped (not dragging), conflict takes precedence (Red + Border)
                            if (isConflict && !isDragging) {
                                colorClass = "bg-red-500 border-2 border-red-700";
                            } else if (isExact) {
                                colorClass = "bg-green-500"; 
                            } else if (hasOverlapWithAny) {
                                colorClass = "bg-amber-400"; 
                            } else {
                                colorClass = "bg-red-500";   
                            }
                            
                            // Visual hint for conflict while dragging?
                            // User says: "duplicate remaining... color change"
                            // If dragging AND conflict, maybe we combine?
                            // "重複残した...のみで色を変更" -> change color based ONLY on pref/shifted/outside.
                            // So if dragging, purely pref based.
                            
                            if (band.requests.length === 0) colorClass = "bg-slate-400";

                            const startTimeStr = logic.idxToTimeStr(assignment.start, dayIdx);
                            const endTimeStr = logic.idxToTimeStr(assignment.start + duration, dayIdx);
                            const timeLabel = `${startTimeStr} - ${endTimeStr}`;

                            const tooltipText = `${band.name}\n` + 
                                                `${timeLabel}\n` +
                                                `希望持ち時間: ${band.duration_min}分\n` + 
                                                `----------------\n` +
                                                deviations.join('\n');

                            return (
                                <div
                                    key={band.id}
                                    className={cn(
                                        "absolute left-12 right-2 rounded-md shadow-sm border border-white/20 text-white text-xs font-bold flex flex-col items-center justify-center transition-all hover:brightness-110",
                                        colorClass,
                                        isDragging ? "cursor-grabbing z-50 shadow-lg scale-105 opacity-90" : (band.isFixed ? "cursor-not-allowed border-2 border-yellow-400/70" : "cursor-grab"),
                                        dragState && !isDragging && "opacity-50"
                                    )}
                                    style={{ 
                                        top: `${startPercent}%`, 
                                        height: `${heightPercent}%`,
                                        zIndex: isDragging ? 50 : 10
                                    }}
                                    title={tooltipText}
                                    onMouseDown={(e) => {
                                        if (band.isFixed) return;
                                        if (e.button !== 0) return;
                                        e.preventDefault();
                                        e.stopPropagation();
                                        saveToHistory();
                                        setDragState({
                                            type: 'move',
                                            bandId: bid,
                                            startY: e.clientY,
                                            initialStartIdx: assignment.start,
                                            initialDayIdx: assignment.day,
                                            initialDuration: duration,
                                            dragStageId: stageId
                                        });
                                    }}
                                >
                                    <div className="flex items-center gap-1 w-full justify-center px-1 pointer-events-none">
                                        <span className="truncate max-w-[60%]">{band.name}</span>
                                        <span className="text-[10px] opacity-90 whitespace-nowrap hidden sm:inline-block">({timeLabel})</span>
                                    </div>
                                    
                                    {/* Resize Handle */}
                                    {!band.isFixed && (
                                        <div 
                                            className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize hover:bg-black/10 flex items-center justify-center group"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                saveToHistory();
                                                setDragState({
                                                    type: 'resize',
                                                    bandId: bid,
                                                    startY: e.clientY,
                                                    initialStartIdx: assignment.start,
                                                    initialDayIdx: assignment.day,
                                                    initialDuration: duration,
                                                    dragStageId: stageId
                                                });
                                            }}
                                        >
                                            <div className="w-8 h-1 bg-white/30 rounded-full group-hover:bg-white/50" />
                                        </div>
                                    )}
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
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 font-sans relative flex flex-col">
      <UsageGuide isOpen={showGuide} onClose={() => setShowGuide(false)} />
      
      {/* Header & Stepper */}
      <header className="bg-white border-b z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <BarChart3  className="fill-blue-600 text-blue-600"/>
                    TimeTable Creator
                </h1>
                <button onClick={() => setShowGuide(true)} className="text-blue-600 hover:text-blue-800 text-xs font-bold underline flex items-center gap-1">
                    <HelpCircle size={12}/> 使い方
                </button>
            </div>
            
            {/* Stepper */}
            <div className="flex items-center justify-between relative">
                <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-200 -z-10" />
                
                {[
                    { step: 1, label: "基本設定", icon: Settings },
                    { step: 2, label: "団体登録", icon: Upload },
                    { step: 3, label: "作成・調整", icon: Play }
                ].concat(stages.length > 1 ? [{ step: 4, label: "全体調整", icon: BarChart3 }] as any : []).map((s) => {
                    const isActive = currentStep >= s.step;
                    const isCurrent = currentStep === s.step;
                    return (
                        <button 
                            key={s.step}
                            onClick={() => setCurrentStep(s.step as any)}
                            className={cn(
                                "flex flex-col items-center gap-2 bg-white px-4 py-1 rounded transition-all",
                                isActive ? "text-blue-600" : "text-slate-400"
                            )}
                        >
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                                isActive ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300"
                            )}>
                                <s.icon size={20} />
                            </div>
                            <span className={cn("text-xs font-bold", isCurrent && "text-blue-600")}>{s.label}</span>
                        </button>
                    )
                })}
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto space-y-8">
            
            {/* --- STEP 1: CONFIG --- */}
            {currentStep === 1 && (
                <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-slate-800">イベントの基本情報を設定</h2>
                        <p className="text-slate-500 mt-2">ステージ数、ステージ名、開催日時を入力してください</p>
                    </div>

                    <Card className="p-8 space-y-8">
                        {/* Days & Stage Count */}
                        <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-700">開催日数</label>
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="number" 
                                        min="1" max="10" 
                                        value={days} 
                                        onChange={e => handleDaysChange(Number(e.target.value))} 
                                        className="w-full px-4 py-2 border rounded-lg text-center font-bold text-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                    <span className="text-slate-600">日間</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-700">ステージ数</label>
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="number" 
                                        min="1" max="5" 
                                        value={stages.length} 
                                        onChange={e => setStageCount(Number(e.target.value))} 
                                        className="w-full px-4 py-2 border rounded-lg text-center font-bold text-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                    <span className="text-slate-600">箇所</span>
                                </div>
                            </div>
                        </div>

                         {/* Common Dates */}
                         <div className="space-y-4">
                            <label className="block text-sm font-bold text-slate-700">開催日程 (初日を指定)</label>
                            <div className="flex flex-wrap gap-4 items-center">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-slate-500">Day 1</span>
                                    <input 
                                        type="date" 
                                        value={eventDates[0] || ""} 
                                        onChange={e => updateStartDate(e.target.value)}
                                        className="px-3 py-2 border rounded-md text-sm cursor-pointer hover:bg-slate-50"
                                    />
                                </div>
                                {eventDates[0] && days > 1 && (
                                    <div className="text-sm text-slate-500 font-medium">
                                        〜 <span className="ml-1">Day {days} ({eventDates[days-1]?.slice(5) || ""})</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Per-Stage Config */}
                        <div className="space-y-6 pt-4 border-t">
                             <label className="block text-sm font-bold text-slate-700">ステージ別設定</label>
                             {stages.map((stage) => (
                                 <div key={stage.id} className="bg-slate-50 p-4 rounded-xl border space-y-4">
                                     <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500">ステージ名</label>
                                        <input 
                                            type="text"
                                            className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold"
                                            value={stage.name}
                                            onChange={e => updateStageName(stage.id, e.target.value)}
                                        />
                                     </div>
                                     <div className="space-y-2">
                                         <label className="text-xs font-bold text-slate-500">稼働時間</label>
                                         {stage.dailyTimes.map((dt, dIdx) => (
                                             <div key={dIdx} className="flex items-center gap-2 text-sm bg-white p-2 rounded border">
                                                 <span className="w-12 font-bold text-slate-400">Day {dIdx+1}</span>
                                                 <input type="time" value={dt.start} onChange={e => updateStageTime(stage.id, dIdx, 'start', e.target.value)} 
                                                     className="px-2 py-1 border rounded w-full"/>
                                                 <span>-</span>
                                                 <input type="time" value={dt.end} onChange={e => updateStageTime(stage.id, dIdx, 'end', e.target.value)} 
                                                     className="px-2 py-1 border rounded w-full"/>
                                             </div>
                                         ))}
                                     </div>
                                 </div>
                             ))}
                        </div>

                        <div className="pt-6 flex justify-end">
                            <Button onClick={() => setCurrentStep(2)} className="w-full md:w-auto px-8 py-3 text-base">
                                次へ: 団体登録 <Play size={16} className="ml-2"/>
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* --- STEP 2: DATA --- */}
            {currentStep === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                     <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800">出演団体の登録</h2>
                            <p className="text-slate-500 mt-1">ステージごとに団体を登録してください</p>
                        </div>
                        <div className="flex gap-2">
                             <Button variant="ghost" onClick={handleDownloadTemplate} className="text-slate-500 hover:text-blue-600 text-xs">
                                 テンプレートDL
                             </Button>
                             <div className="relative">
                                <Button variant="outline" className="relative overflow-hidden bg-white">
                                     <Upload size={16} className="mr-2"/> CSV読込
                                     <input type="file" accept=".csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
                                </Button>
                             </div>
                             <Button variant="danger" onClick={() => setBands([])}><X size={16} className="mr-2"/> 全削除</Button>
                        </div>
                    </div>

                    <Card className="overflow-hidden min-h-[500px] flex flex-col">
                        {/* Stage Tabs */}
                        <div className="flex border-b bg-slate-100 overflow-x-auto">
                            {stages.map(stage => (
                                <button 
                                    key={stage.id}
                                    onClick={() => setActiveStageId(stage.id)}
                                    className={cn(
                                        "px-6 py-3 text-sm font-bold transition-all border-r border-slate-200 whitespace-nowrap",
                                        activeStageId === stage.id ? "bg-white text-blue-600 shadow-[0_-2px_0_0_#2563eb_inset]" : "text-slate-500 hover:bg-slate-50"
                                    )}
                                >
                                    {stage.name}
                                </button>
                            ))}
                        </div>

                        <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700">
                                {stages.find(s=>s.id === activeStageId)?.name || ""} の登録リスト 
                                ({bands.filter(b => b.assignedStageId === activeStageId).length}件)
                            </h3>
                            <Button onClick={addNewBand} variant="primary" className="py-1 px-3 text-xs"><Plus size={12} className="mr-1"/> 新規追加</Button>
                        </div>
                        <div className="flex-1 overflow-x-auto">
                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead className="bg-slate-50 text-slate-500 font-medium border-b sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        {/* ID Column Hidden */}
                                        <th className="px-4 py-3 min-w-[200px]">団体名</th>
                                        <th className="px-4 py-3 w-32">持ち時間</th>
                                        <th className="px-4 py-3">希望日程1</th>
                                        <th className="px-4 py-3">希望日程2</th>
                                        <th className="px-4 py-3">希望日程3</th>
                                        <th className="px-4 py-3 w-28">固定枠</th>
                                        <th className="px-4 py-3 w-16">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {bands.filter(b => b.assignedStageId === activeStageId).map((band) => (
                                        <tr key={band.id} className="hover:bg-slate-50">
                                            {/* ID Column Hidden */}
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
                                                                 {[1,2,3,4,5].map(d => (
                                                                     <option key={d} value={d}>Day{d}</option>
                                                                 ))}
                                                             </select>
                                                             <input type="time" className="border rounded px-1 py-1 text-xs w-24" value={req.start} onChange={e => updateRequest(band.id, i, 'start', e.target.value)}/>
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                            <td className="px-2 py-2 bg-slate-50/50 border-l border-r border-slate-100">
                                                <div className="flex flex-col gap-1 w-24">
                                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={band.isFixed || false} 
                                                            onChange={e => {
                                                                const checked = e.target.checked;
                                                                setBands(prev => prev.map(b => {
                                                                    if (b.id !== band.id) return b;
                                                                    
                                                                    // Default to 1st preference if no fixed value set yet
                                                                    const firstReq = b.requests[0];
                                                                    const defaultDay = firstReq?.day || 1;
                                                                    const defaultStart = firstReq?.start || "10:00";
                                                                    
                                                                    return {
                                                                        ...b,
                                                                        isFixed: checked,
                                                                        fixedDay: b.fixedDay ?? defaultDay,
                                                                        fixedStartStr: b.fixedStartStr ?? defaultStart
                                                                    };
                                                                }));
                                                            }}
                                                            className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                                                        />
                                                        <span className="text-[10px] font-bold text-slate-600">固定</span>
                                                    </label>
                                                    {band.isFixed && (
                                                        <div className="flex flex-col gap-1 animate-in fade-in zoom-in-50 duration-200">
                                                            <select 
                                                                value={band.fixedDay || 1}
                                                                onChange={e => updateBand(band.id, 'fixedDay', Number(e.target.value))}
                                                                className="border rounded text-[10px] py-1 px-1 bg-white"
                                                            >
                                                                {Array.from({length: days}).map((_, i) => (
                                                                    <option key={i} value={i+1}>Day {i+1}</option>
                                                                ))}
                                                            </select>
                                                            <input 
                                                                type="time" 
                                                                value={band.fixedStartStr || "10:00"}
                                                                onChange={e => updateBand(band.id, 'fixedStartStr', e.target.value)}
                                                                className="border rounded text-[10px] py-1 px-1 w-full"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <button onClick={() => removeBand(band.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors" title="削除">
                                                    <Trash2 size={16}/>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {bands.filter(b => b.assignedStageId === activeStageId).length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-20 text-center text-slate-400">
                                                <div className="flex flex-col items-center gap-4">
                                                    <div className="bg-slate-100 p-4 rounded-full">
                                                        <Upload size={48} className="text-slate-300"/>
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-600">データがありません</p>
                                                        <p className="text-sm">CSVファイルを読み込むか、新規追加ボタンを押してください</p>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 bg-slate-50 border-t flex justify-between items-center">
                            <Button variant="ghost" onClick={() => setCurrentStep(1)}>戻る</Button>
                            <Button onClick={() => setCurrentStep(3)} disabled={bands.length===0} className="px-8 py-3 text-base">
                                次へ: スケジュール作成 <Play size={16} className="ml-2"/>
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* --- STEP 3: OPTIMIZE & RESULT --- */}
            {currentStep === 3 && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300 items-start">
                    
                    {/* Left: Control Panel */}
                    <Card className="lg:col-span-1 p-4 flex flex-col sticky top-24 max-h-[calc(100vh-100px)] overflow-y-auto">
                        <div className="mb-4">
                            <h3 className="font-bold text-slate-800">最適化設定</h3>
                        </div>

                        {/* Stage Selector for Optimization */}
                        {stages.length > 1 && (
                            <div className="mb-6 space-y-2">
                                <label className="text-xs font-bold text-slate-500">対象ステージ</label>
                                <select 
                                    className="w-full px-3 py-2 border rounded-lg text-sm bg-slate-50 font-bold"
                                    value={activeStageId}
                                    onChange={e => setActiveStageId(e.target.value)}
                                >
                                    {stages.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Reduction Rate */}
                        <div className="mb-6 space-y-2">
                             <div className="flex justify-between items-center mb-1">
                                <span className="text-sm text-slate-600 font-medium">全体の時間短縮</span>
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                    {stages.find(s=>s.id === activeStageId)?.reductionRate ?? 0}%
                                </span>
                            </div>
                            <input type="range" min="0" max="50" step="5" 
                               value={stages.find(s=>s.id === activeStageId)?.reductionRate ?? 0} 
                               onChange={e => {
                                   const val = Number(e.target.value);
                                   setStages(prev => prev.map(s => s.id === activeStageId ? { ...s, reductionRate: val } : s));
                               }}
                               className="w-full accent-blue-600 cursor-pointer"/>
                            <p className="text-[10px] text-slate-400">
                                持ち時間を全体的に圧縮して、枠内に収まりやすくします。
                            </p>
                        </div>

                        {/* Interval Settings */}
                        <div className="mb-6 space-y-2">
                             <div className="flex justify-between items-center mb-1">
                                <span className="text-sm text-slate-600 font-medium">団体間インターバル</span>
                                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                                    {stages.find(s=>s.id === activeStageId)?.intervalMin ?? 0}分
                                </span>
                            </div>
                            <input type="range" min="0" max="30" step="5" 
                               value={stages.find(s=>s.id === activeStageId)?.intervalMin ?? 0} 
                               onChange={e => {
                                   const val = Number(e.target.value);
                                   setStages(prev => prev.map(s => s.id === activeStageId ? { ...s, intervalMin: val } : s));
                               }}
                               className="w-full accent-slate-500 cursor-pointer"/>
                             <p className="text-[10px] text-slate-400">
                                転換・セッティング時間を確保します。
                            </p>
                        </div>

                        {/* Advanced Settings */}
                        <details className="group mb-6">
                            <summary className="text-xs font-bold uppercase text-slate-400 tracking-wider cursor-pointer flex items-center justify-between list-none hover:text-slate-600">
                                詳細パラメータ
                                <Settings size={14} className="group-open:rotate-90 transition-transform"/>
                            </summary>
                            <div className="mt-4 space-y-3 pl-1 border-l-2 border-slate-100 ml-1">
                                <label className="block text-xs">
                                    <span className="text-slate-600 font-medium">試行回数 (Trials)</span>
                                    <input type="number" min="1" max="1000" value={saTrials} 
                                        onChange={e => setSaTrials(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-full mt-1 px-2 py-1 border rounded text-xs"/>
                                </label>
                                
                                <div className="flex items-center gap-2 mt-2">
                                    <input type="checkbox" id="allowOutside" 
                                        checked={allowOutsidePreference} 
                                        onChange={e => setAllowOutsidePreference(e.target.checked)}
                                        className="rounded border-slate-300"/>
                                    <label htmlFor="allowOutside" className="text-xs text-slate-600 font-medium">希望外(赤)を許可</label>
                                </div>
                                <div className="my-2 border-t border-slate-100"></div>
                                <div className="mb-1 text-[10px] text-slate-400 font-bold uppercase">ペナルティ重み</div>
                                <label className="block text-xs">
                                    <span className="text-slate-600">重複NG</span>
                                    <input type="number" value={costParams.PENALTY_OVERLAP} 
                                        onChange={e => setCostParams(p => ({...p, PENALTY_OVERLAP: Number(e.target.value)}))}
                                        className="w-full mt-1 px-1 py-1 border rounded text-xs"/>
                                </label>
                                <label className="block text-xs">
                                    <span className="text-slate-600">未割当NG</span>
                                    <input type="number" value={costParams.PENALTY_UNASSIGNED} 
                                        onChange={e => setCostParams(p => ({...p, PENALTY_UNASSIGNED: Number(e.target.value)}))}
                                        className="w-full mt-1 px-1 py-1 border rounded text-xs"/>
                                </label>
                            </div>
                        </details>

                        <div className="mt-auto space-y-4">
                            <Button className="w-full py-4 text-base shadow-lg shadow-blue-200" onClick={() => runOptimization()} disabled={isOptimizing}>
                                {isOptimizing ? (
                                    <span className="animate-pulse">考え中...</span>
                                ) : (
                                    <>
                                        <Play size={18} className="fill-current" /> {stages.length > 1 ? `${stages.find(s=>s.id===activeStageId)?.name || 'ステージ'}を作成` : "作成スタート"}
                                    </>
                                )}
                            </Button>
                            
                            {isOptimizing && (
                                <div className="space-y-2">
                                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                                    </div>
                                    <div className="text-center">
                                        <span className="text-sm font-bold text-blue-600">{Math.round(progress)}%</span>
                                        <p className="text-xs text-slate-500">{statusMessage}</p>
                                    </div>
                                </div>
                            )}

                             {/* Result Status Display */}
                            {!isOptimizing && resultStatus?.type === 'failure' && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs space-y-2 text-red-700">
                                    <p className="font-bold flex items-center gap-1"><AlertTriangle size={14}/> 失敗...</p>
                                    <p>条件が厳しすぎます。時間短縮率を上げるか、希望外を許可してください。</p>
                                </div>
                            )}

                            {!isOptimizing && resultStatus?.type === 'success' && (
                                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 text-center">
                                    <p className="font-bold flex items-center justify-center gap-1"><Check size={14}/> 完成！</p>
                                </div>
                            )}
                            
                            <hr className="border-slate-100"/>
                            <Button variant="outline" onClick={handleExportCSV} disabled={bands.length === 0} className="w-full">
                                <Download size={16} className="mr-2"/> CSV保存
                            </Button>
                            {stages.length > 1 && (
                                <Button className="w-full bg-slate-700 hover:bg-slate-800 text-white" onClick={() => setCurrentStep(4)}>
                                    <BarChart3 size={16} className="mr-2"/> 全体調整へ
                                </Button>
                            )}
                            <Button variant="ghost" onClick={() => setCurrentStep(2)} className="w-full border-t">
                                戻る
                            </Button>
                        </div>
                    </Card>

                    {/* Right: Timeline & Results */}
                    <div className="lg:col-span-3 flex flex-col space-y-8">
                        <Card className="flex flex-col">
                            <div className="p-4 border-b bg-slate-50 flex justify-between items-center flex-shrink-0">
                                <h3 className="font-bold text-slate-700">{stages.find(s=>s.id === activeStageId)?.name} タイムライン</h3>
                                <div className="flex gap-3 text-xs">
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-sm"></div> 希望通り</div>
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-400 rounded-sm"></div> 時間ズレ</div>
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm"></div> 希望外</div>
                                </div>
                            </div>
                            <div className="p-4 overflow-x-auto">
                                <Timeline stageId={activeStageId} />
                            </div>
                        </Card>

                        {/* Adjust Table (Collapsible or small) */}
                        <Card className="flex flex-col">
                            <div className="p-3 border-b bg-slate-50">
                                <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">詳細調整リスト</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left relative">
                                    <thead className="bg-slate-50 text-slate-500 font-medium border-b sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-2">団体名</th>
                                            <th className="px-4 py-2 w-24">時間(分)</th>
                                            <th className="px-4 py-2 w-24">日程</th>
                                            <th className="px-4 py-2 w-24">開始</th>
                                            <th className="px-4 py-2">状態</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {bands.filter(b => b.assignedStageId === activeStageId).map((band) => {
                                            const bid = String(band.id);
                                            const sol = solution[bid];
                                            const dur = durations[bid] ?? Math.floor(band.duration_min/5);
                                            const logic = schedulerRefs.current[activeStageId];
                                            
                                            let statusNode = <span className="text-xs text-slate-400">ー</span>;
                                            if (logic && sol) {
                                                statusNode = <span className="text-xs text-emerald-600 font-bold">配置済</span>
                                            }

                                            return (
                                                <tr key={band.id} className="hover:bg-slate-50">
                                                    <td className="px-4 py-1 font-medium">{band.name}</td>
                                                    <td className="px-4 py-1">
                                                        <input type="number" step="5" min="5" className="w-16 px-1 border rounded text-xs"
                                                            value={dur * 5}
                                                            onChange={(e) => {
                                                                saveToHistory();
                                                                const val = parseInt(e.target.value) || 5;
                                                                setDurations(prev => ({ ...prev, [bid]: Math.floor(val/5) }));
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-1">
                                                        <select className="w-full px-1 border rounded text-xs"
                                                            value={sol ? sol.day : ""}
                                                            onChange={(e) => {
                                                                saveToHistory();
                                                                const val = e.target.value;
                                                                setSolution(prev => {
                                                                    const next = { ...prev };
                                                                    if (val === "") next[bid] = null;
                                                                    else {
                                                                        const d = parseInt(val);
                                                                        const s = next[bid]?.start ?? 0;
                                                                        next[bid] = { day: d, start: s };
                                                                    }
                                                                    return next;
                                                                });
                                                            }}
                                                        >
                                                            <option value="">(未)</option>
                                                            {logic && Array.from({ length: logic.days }).map((_, i) => (
                                                                <option key={i} value={i}>D{i+1}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-1">
                                                        <input type="time" className="w-full px-1 border rounded text-xs"
                                                            value={sol && logic ? logic.idxToTimeStr(sol.start, sol.day) : ""}
                                                            onChange={(e) => {
                                                                if (!logic || !sol) return;
                                                                saveToHistory();
                                                                const idx = logic.timeStrToIdx(e.target.value, sol.day);
                                                                if (idx !== -1) setSolution(p => ({...p, [bid]: {...sol, start: idx}}));
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-1">{statusNode}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                </div>
            )}

            {/* --- STEP 4: MULTI-STAGE ADJUSTMENT --- */}
            {currentStep === 4 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border">
                        <Button onClick={() => setCurrentStep(3)} variant="outline">
                             <Settings size={16} className="mr-2"/> 戻る
                        </Button>
                        <Button variant="outline" onClick={handleExportCSV}>
                            <Download size={16} className="mr-2"/> CSV保存
                        </Button>
                    </div>

                    <div className="flex gap-4 overflow-x-auto pb-8">
                        {stages.map(stage => (
                             <Card key={stage.id} className="min-w-[400px] flex-1 flex flex-col shrink-0">
                                <div className="p-4 border-b bg-slate-50 font-bold sticky top-0 z-10">
                                    {stage.name}
                                </div>
                                <div className="p-4 flex-1">
                                    <Timeline stageId={stage.id} />
                                </div>
                                <div className="p-2 border-t bg-slate-50 max-h-48 overflow-y-auto">
                                    <table className="w-full text-xs">
                                        <thead className="text-slate-500">
                                            <tr>
                                                <th className="p-1">団体名</th>
                                                <th className="p-1">時間</th>
                                                <th className="p-1">ステージ移動</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {bands.filter(b => b.assignedStageId === stage.id).map(b => (
                                                <tr key={b.id}>
                                                    <td className="p-1 font-medium">{b.name}</td>
                                                    <td className="p-1">{durations[String(b.id)] ? durations[String(b.id)]*5 : b.duration_min}分</td>
                                                    <td className="p-1">
                                                        <select 
                                                            className="border rounded px-1 py-0.5"
                                                            value={b.assignedStageId}
                                                            onChange={(e) => {
                                                                saveToHistory();
                                                                const newSId = e.target.value;
                                                                // Change stage
                                                                setBands(arr => arr.map(x => x.id === b.id ? { ...x, assignedStageId: newSId } : x));
                                                                // Clear solution when moving? Or try to keep?
                                                                // Better clear to avoid out-of-bounds
                                                                setSolution(s => {
                                                                    if (s[String(b.id)]) {
                                                                        const cp = { ...s };
                                                                        delete cp[String(b.id)];
                                                                        return cp;
                                                                    }
                                                                    return s;
                                                                });
                                                            }}
                                                        >
                                                            {stages.map(s => (
                                                                <option key={s.id} value={s.id}>{s.name}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                             </Card>
                        ))}
                    </div>
                </div>
            )}

        </div>
      </main>
    </div>
  );
}
