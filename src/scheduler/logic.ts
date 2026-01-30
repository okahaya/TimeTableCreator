// --------------------------------------------------------
// Types
// --------------------------------------------------------
export type Request = {
    day: number;
    start: string;
};

export type Band = {
    id: number | string;
    name: string;
    duration_min: number;
    requests: Request[];
    isFixed?: boolean;
    fixedDay?: number;
    fixedStartStr?: string;
};

export type Assignment = {
    day: number;
    start: number; // 5-min slot index
} | null;

export type Solution = Record<string, Assignment>;

export type ScheduleItem = {
    bandId: string | number;
    bandName: string;
    day: number;
    startIdx: number;
    durationIdx: number;
    actualStartStr: string;
    actualEndStr: string;
    status: 'preferred' | 'shifted' | 'outside' | 'error';
    details: string;
    originalDuration: number;
};

export type CostParams = {
    PENALTY_OVERLAP: number;
    PENALTY_UNASSIGNED: number;
    PENALTY_OUTSIDE_PREF: number;
    PRIORITY_COST_1: number;
    PRIORITY_COST_2: number;
    PRIORITY_COST_3: number;
    PENALTY_OVERFLOW: number;
    PENALTY_EQUITY: number;
};

// --------------------------------------------------------
// Logic (Transpiled from Python)
// --------------------------------------------------------
export enum OptimizationMethod {
    SA = "sa",
}

export class SchedulerLogic {
    // Daily Configuration
    dailyConfigs: { startMin: number; endMin: number; slots: number; offset: number; date?: string }[];
    days: number;
    intervalSlots: number;
    
    // Cost Parameters
    PENALTY_OVERLAP: number;
    PENALTY_UNASSIGNED: number;
    PENALTY_OUTSIDE_PREF: number;
    PRIORITY_COSTS: number[];
    PENALTY_OVERFLOW: number;
    PENALTY_EQUITY: number;

    constructor(
        dailyTimes: { start: string; end: string; date?: string }[],
        intervalMin = 0,
        costParams?: Partial<CostParams>
    ) {
        this.days = dailyTimes.length;
        this.intervalSlots = Math.floor(intervalMin / 5);
        
        this.dailyConfigs = dailyTimes.map(dt => {
            const [sh, sm] = dt.start.split(":").map(Number);
            const [eh, em] = dt.end.split(":").map(Number);
            const startMinutes = sh * 60 + sm;
            const endMinutes = eh * 60 + em;
            return {
                startMin: startMinutes,
                endMin: endMinutes,
                slots: Math.max(0, Math.floor((endMinutes - startMinutes) / 5)),
                offset: startMinutes,
                date: dt.date
            };
        });

        const defaults: CostParams = {
            PENALTY_OVERLAP: 100000,
            PENALTY_UNASSIGNED: 50000,
            PENALTY_OUTSIDE_PREF: 100000,
            PRIORITY_COST_1: 0,
            PRIORITY_COST_2: 500,
            PRIORITY_COST_3: 1000,
            PENALTY_OVERFLOW: 100,
            PENALTY_EQUITY: 1,
        };

        const params = { ...defaults, ...costParams };
        this.PENALTY_OVERLAP = params.PENALTY_OVERLAP;
        this.PENALTY_UNASSIGNED = params.PENALTY_UNASSIGNED;
        this.PENALTY_OUTSIDE_PREF = params.PENALTY_OUTSIDE_PREF;
        this.PRIORITY_COSTS = [
            params.PRIORITY_COST_1,
            params.PRIORITY_COST_2,
            params.PRIORITY_COST_3,
        ];
        this.PENALTY_OVERFLOW = params.PENALTY_OVERFLOW;
        this.PENALTY_EQUITY = params.PENALTY_EQUITY;
    }

    timeStrToIdx(timeStr: string, dayIdx: number = 0): number {
        try {
            if (dayIdx < 0 || dayIdx >= this.days) return -1;
            const [h, m] = timeStr.split(":").map(Number);
            const minutes = h * 60 + m;
            return Math.floor((minutes - this.dailyConfigs[dayIdx].offset) / 5);
        } catch {
            return -1;
        }
    }

    idxToTimeStr(idx: number, dayIdx: number = 0): string {
        if (dayIdx < 0 || dayIdx >= this.days) return "00:00";
        const totalMinutes = this.dailyConfigs[dayIdx].offset + idx * 5;
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        const hStr = h.toString().padStart(2, '0');
        const mStr = m.toString().padStart(2, '0');
        return `${hStr}:${mStr}`;
    }

    calculateCost(
        solution: Solution,
        bandsData: Band[],
        slotDurationMap: Record<string, number>
    ): { cost: number; grid: number[][]; outsideCount: number; hasOverlap: boolean } {
        let cost = 0;
        let outsideCount = 0;
        let hasOverlap = false;
        
        // Grid: returns number[day][slot]
        const grid: number[][] = this.dailyConfigs.map(c => new Array(c.slots).fill(0));

        const bandCosts: number[] = [];

        for (const band of bandsData) {
            const bid = String(band.id);
            const assignment = solution[bid];
            
            let thisBandCost = 0;
            
            // 2. Unassigned Penalty
            if (!assignment) {
                thisBandCost += this.PENALTY_UNASSIGNED;
                cost += this.PENALTY_UNASSIGNED;
                bandCosts.push(thisBandCost);
                continue;
            }

            const { day, start } = assignment;
            const duration = slotDurationMap[bid];
            const end = start + duration;
            
            const daySlots = this.dailyConfigs[day] ? this.dailyConfigs[day].slots : 0;

            if (start < 0 || end > daySlots) {
                thisBandCost += this.PENALTY_UNASSIGNED;
                cost += this.PENALTY_UNASSIGNED;
                bandCosts.push(thisBandCost);
                continue;
            }

            // Fill Grid (Occupancy + Interval)
            const occupyEnd = Math.min(end + this.intervalSlots, daySlots);
            for (let t = Math.floor(start); t < Math.floor(occupyEnd); t++) {
                if (t >= 0 && t < daySlots) {
                    grid[day][t] += 1;
                }
            }

            // 3. Match Preference
            const originalDuration = Math.floor(band.duration_min / 5);
            let bestReqCost = Infinity;
            let foundMatchingDay = false;
            let isSatisfied = false; // Overlap exists with at least one request on same day

            for (let i = 0; i < band.requests.length; i++) {
                if (i >= this.PRIORITY_COSTS.length) break;
                const req = band.requests[i];
                const reqDay = req.day - 1;

                if (day === reqDay) {
                    foundMatchingDay = true;
                    const reqStart = this.timeStrToIdx(req.start, reqDay);
                    // Req duration is originalDuration, assigned is 'duration'
                    // For logic.ts simple overlap, we check assigned vs request
                    // Request interval: [reqStart, reqStart + originalDuration]
                    const reqEndSlot = reqStart + originalDuration;
                
                    const overflow = Math.max(0, reqStart - start) + Math.max(0, end - reqEndSlot);
                    const reqCost = this.PRIORITY_COSTS[i] + (overflow * this.PENALTY_OVERFLOW);

                    if (reqCost < bestReqCost) {
                        bestReqCost = reqCost;
                    }

                    // Strict Overlap Check for "Outside" Determination (Red vs Yellow/Green)
                    // If any overlap exists, it's not "Red"
                    if (Math.max(start, reqStart) < Math.min(end, reqEndSlot)) {
                        isSatisfied = true;
                    }
                }
            }

            if (foundMatchingDay) {
                thisBandCost += bestReqCost;
                // Even if day matches, if NO overlap occurred with any request, count as Outside (Red)
                if (!isSatisfied) {
                    outsideCount++;
                }
            } else {
                thisBandCost += this.PENALTY_OUTSIDE_PREF;
                outsideCount++;
            }

            cost += thisBandCost;
            bandCosts.push(thisBandCost);
        }

        // 1. Overlap Penalty
        for (let d = 0; d < this.days; d++) {
            const slots = this.dailyConfigs[d].slots;
            for (let t = 0; t < slots; t++) {
                if (grid[d][t] > 1) {
                    cost += (grid[d][t] - 1) * this.PENALTY_OVERLAP;
                    hasOverlap = true;
                }
            }
        }

        // Equity
        if (bandCosts.length > 1) {
            const mean = bandCosts.reduce((a, b) => a + b, 0) / bandCosts.length;
            const variance = bandCosts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / bandCosts.length;
            const stdev = Math.sqrt(variance);
            cost += stdev * this.PENALTY_EQUITY;
        }

        // Normalize
        if (bandsData.length > 0) {
            cost = cost / bandsData.length;
        }

        return { cost, grid, outsideCount, hasOverlap };
    }

    async optimize(
        bands: Band[],
        currentDurs: Record<string, number>,
        onProgress: (progress: number, score: number) => void,
        initialSolution?: Solution,
        runSynchronous: boolean = false
    ): Promise<{ solution: Solution; cost: number; outsideCount: number; hasOverlap: boolean }> {
        return this.runSA(bands, currentDurs, onProgress, initialSolution, runSynchronous);
    }

    private async runSA(
        bands: Band[],
        currentDurs: Record<string, number>,
        onProgress: (progress: number, score: number) => void,
        initialSol?: Solution,
        runSynchronous: boolean = false
    ): Promise<{ solution: Solution; cost: number; outsideCount: number; hasOverlap: boolean }> {
        return new Promise((resolve) => {
            // 1. Setup Data & Fast Access Structures
            const N = bands.length;
            if (N === 0) return resolve({ solution: {}, cost: 0, outsideCount: 0, hasOverlap: false });

            // Tuning Parameters
            const iterations = 100000;
            const startTemp = 100;
            const batchSize = runSynchronous ? 5000 : 1000;

            // Cache constants to local variables for faster access
            const P_OVERLAP = this.PENALTY_OVERLAP;
            const P_UNASSIGNED = this.PENALTY_UNASSIGNED;
            const P_OUTSIDE = this.PENALTY_OUTSIDE_PREF;
            const P_OVERFLOW = this.PENALTY_OVERFLOW;
            const P_EQUITY = this.PENALTY_EQUITY;
            const INTERVAL_SLOTS = this.intervalSlots;
            const DAYS = this.days;

            const bandIds = bands.map(b => String(b.id));
            const bandDurations = new Int32Array(N);
            const bandOriginalDurations = new Int32Array(N);
            
            // Pre-parse requests for fast access
            // flattened requests [ { dayIdx, startSlot, endSlot, cost, ... } ]
            type ParsedReq = { dayIdx: number, startSlot: number, endSlot: number, cost: number };
            const bandRequests: ParsedReq[][] = [];
            
            // Cache daily config values
            const dailySlots = new Int32Array(DAYS);
            for(let d=0; d<DAYS; d++) dailySlots[d] = this.dailyConfigs[d].slots;

            bands.forEach((b, i) => {
                bandDurations[i] = currentDurs[String(b.id)];
                bandOriginalDurations[i] = (b.duration_min / 5) | 0;

                const reqs: ParsedReq[] = [];
                b.requests.forEach((r, rIdx) => {
                    if (rIdx >= this.PRIORITY_COSTS.length) return;
                    const dIdx = r.day - 1;
                    const sSlot = this.timeStrToIdx(r.start, dIdx);
                    if (sSlot !== -1) {
                        reqs.push({
                            dayIdx: dIdx,
                            startSlot: sSlot,
                            endSlot: sSlot + bandOriginalDurations[i],
                            cost: this.PRIORITY_COSTS[rIdx]
                        });
                    }
                });
                bandRequests.push(reqs);
            });

            // Grid Setup (Flattened Int16Array)
            const dayOffsets = new Int32Array(DAYS);
            let totalGridSlots = 0;
            for (let d = 0; d < DAYS; d++) {
                dayOffsets[d] = totalGridSlots;
                totalGridSlots += dailySlots[d];
            }
            const grid = new Int16Array(totalGridSlots).fill(0);

            // State Arrays
            // solDays[i] = day index, -1 if null
            // solStarts[i] = start slot index, -1 if null
            const solDays = new Int32Array(N).fill(-1);
            const solStarts = new Int32Array(N).fill(-1);
            const isFixedArr = new Uint8Array(N).fill(0); // 1 if fixed
            
            const currentBandCosts = new Float64Array(N);
            const isOutsidePref = new Uint8Array(N);

            let sumBandCost = 0;
            let sumBandCostSq = 0;
            let overlapPenaltyTotal = 0;
            let totalOutsideCount = 0;

            // --- Helpers ---

            // Calculate Base Cost (Preference + Unassigned + Overflow) 
            // - Does NOT check Grid/Overlap (handled separately)
            // - Returns { cost, isOut } 
            const getBaseCost = (bIdx: number, d: number, s: number): { cost: number; isOut: boolean } => {
                if (d === -1) {
                    return { cost: P_UNASSIGNED, isOut: false };
                }
                // Use cached array
                const maxSlots = dailySlots[d];
                const dur = bandDurations[bIdx];
                if (s < 0 || s + dur > maxSlots) {
                    return { cost: P_UNASSIGNED, isOut: false };
                }

                let bestReqCost = Infinity;
                let foundDayMatch = false;
                let satisfied = false;

                const myEnd = s + dur;
                const reqs = bandRequests[bIdx];
                const reqLen = reqs.length;

                for (let i = 0; i < reqLen; i++) {
                    const req = reqs[i];
                    if (req.dayIdx === d) {
                        foundDayMatch = true;
                        
                        // Cost Calculation (Priority + Overflow)
                        const rEnd = req.endSlot;
                        // Avoid Math.max overhead if possible, but JS Math.max is fast enough
                        const startDiff = req.startSlot - s;
                        const endDiff = myEnd - rEnd;
                        const overflow = (startDiff > 0 ? startDiff : 0) + (endDiff > 0 ? endDiff : 0);
                        
                        const c = req.cost + (overflow * P_OVERFLOW);
                        
                        if (c < bestReqCost) bestReqCost = c;

                        // Satisfaction check (Strict overlap)
                        // max(start, reqStart) < min(end, reqEndSlot)
                        const overS = s > req.startSlot ? s : req.startSlot;
                        const overE = myEnd < rEnd ? myEnd : rEnd;
                        
                        if (overS < overE) {
                            satisfied = true;
                        }
                    }
                }

                if (foundDayMatch) {
                    return { cost: bestReqCost, isOut: !satisfied };
                } else {
                    return { cost: P_OUTSIDE, isOut: true };
                }
            };

            // Calculate Grid Delta without modifying grid
            const calcGridDelta = (bIdx: number, d: number, s: number, mode: number): number => {
                if (d === -1) return 0;
                const dur = bandDurations[bIdx];
                const offset = dayOffsets[d];
                const max = dailySlots[d];
                // Manually inline Math.min/max for critical path
                let end = s + dur + INTERVAL_SLOTS;
                if (end > max) end = max;
                const start = s > 0 ? s : 0;
                
                let delta = 0;
                let ptr = offset + start;
                const ptrEnd = offset + end;

                // mode 1: Adding band. Delta increases if grid already has items
                // mode -1: Removing band. Delta decreases if grid still has items (>1 means overlap existed)
                if (mode === 1) {
                    for (; ptr < ptrEnd; ptr++) {
                        if (grid[ptr] >= 1) delta += P_OVERLAP;
                    }
                } else {
                    for (; ptr < ptrEnd; ptr++) {
                        if (grid[ptr] > 1) delta -= P_OVERLAP;
                    }
                }
                return delta;
            };

            // Apply grid updates
            const applyGridUpdate = (bIdx: number, d: number, s: number, mode: number) => {
                if (d === -1) return;
                const dur = bandDurations[bIdx];
                const offset = dayOffsets[d];
                const max = dailySlots[d];
                let end = s + dur + INTERVAL_SLOTS;
                if (end > max) end = max;
                const start = s > 0 ? s : 0;
                
                let ptr = offset + start;
                const ptrEnd = offset + end;
                
                for (; ptr < ptrEnd; ptr++) {
                    grid[ptr] += mode;
                }
            };

            // --- Init Solution ---
            const startSol = initialSol || {};
            for (let i = 0; i < N; i++) {
                const band = bands[i];
                const bid = bandIds[i];

                if (band.isFixed && band.fixedDay !== undefined && band.fixedStartStr) {
                    isFixedArr[i] = 1;
                    const fDay = band.fixedDay - 1; // requests use 1-based, assuming fixedDay also from input 1-based
                    // Check validity
                    if (fDay >= 0 && fDay < DAYS) {
                        const sIdx = this.timeStrToIdx(band.fixedStartStr, fDay);
                        const dur = bandDurations[i];
                        const slots = dailySlots[fDay];
                        
                        if (sIdx !== -1 && sIdx + dur <= slots) {
                             solDays[i] = fDay;
                             solStarts[i] = sIdx;
                        } else {
                            // Invalid fixed position? Force unassign or error?
                            // For now unassigned to avoid crashing worker
                            solDays[i] = -1; solStarts[i] = -1;
                        }
                    } else {
                         solDays[i] = -1; solStarts[i] = -1;
                    }
                } else if (startSol[bid]) {
                    solDays[i] = startSol[bid]!.day;
                    solStarts[i] = startSol[bid]!.start;
                } else if (!initialSol) {
                    // Fast random init
                    const d = (Math.random() * DAYS) | 0;
                    const dur = bandDurations[i];
                    const slots = dailySlots[d];
                    if (slots >= dur) {
                        solDays[i] = d;
                        solStarts[i] = (Math.random() * (slots - dur + 1)) | 0;
                    } else {
                        solDays[i] = -1; solStarts[i] = -1;
                    }
                } else {
                    solDays[i] = -1; solStarts[i] = -1;
                }

                // Apply initial state
                // For initial, calc and update are same time
                applyGridUpdate(i, solDays[i], solStarts[i], 1);
                // But we need to calculate initial overlap penalty. 
                // applyGridUpdate doesn't return cost. 
                // We should probably just use calcGridDelta before applying? 
                // Initial build loop: 
                // Since we build one by one, we can just check what overlap we create.
                // Or just scan grid at the end? Scanning grid is safer.
            }

            // Recalculate full overlap penalty once from grid
            overlapPenaltyTotal = 0;
            const gridLen = grid.length;
            for(let k=0; k<gridLen; k++) {
                if (grid[k] > 1) overlapPenaltyTotal += (grid[k] - 1) * P_OVERLAP;
            }

            // Initial costs
            for (let i = 0; i < N; i++) {
                const { cost, isOut } = getBaseCost(i, solDays[i], solStarts[i]);
                currentBandCosts[i] = cost;
                sumBandCost += cost;
                sumBandCostSq += cost * cost;
                isOutsidePref[i] = isOut ? 1 : 0;
                if (isOut) totalOutsideCount++;
            }

            // Calc Total
            const calcTotal = (sum: number, sqSum: number, overlap: number) => {
                let c = sum + overlap;
                if (N > 1) {
                    const avg = sum / N;
                    const v = (sqSum / N) - (avg * avg);
                    // Variance can be tiny neg due to precision
                    const stdev = Math.sqrt(v > 0 ? v : 0);
                    c += stdev * P_EQUITY;
                }
                return c / N;
            };

            let currentTotalCost = calcTotal(sumBandCost, sumBandCostSq, overlapPenaltyTotal);
            let bestCost = currentTotalCost;
            
            // Best Tracking
            const bestSolDays = new Int32Array(solDays);
            const bestSolStarts = new Int32Array(solStarts);

            // --- Loop ---
            let i = 0;
            const step = () => {
                const end = i + batchSize < iterations ? i + batchSize : iterations;
                
                for (; i < end; i++) {
                    let temp = startTemp * (1 - (i / iterations));
                    if (temp <= 0.001) temp = 0.001;

                    // Math.random compare is fast
                    if (Math.random() < 0.5) {
                        // --- MOVE ---
                        const targetIdx = (Math.random() * N) | 0;
                        if (isFixedArr[targetIdx] === 1) continue;

                        const oldD = solDays[targetIdx];
                        const oldS = solStarts[targetIdx];

                        // Pick New
                        const newD = (Math.random() * DAYS) | 0;
                        const dur = bandDurations[targetIdx];
                        const slots = dailySlots[newD];
                        let newS = -1;
                        if (slots >= dur) {
                             newS = (Math.random() * (slots - dur + 1)) | 0;
                        }

                        if (oldD === newD && oldS === newS) continue;

                        // Tentative Cost Calc : Delta Only
                        // 1. Grid Delta (Lookahead)
                        let deltaOverlap = 0;
                        // Removing old pos: will it reduce penalty?
                        deltaOverlap += calcGridDelta(targetIdx, oldD, oldS, -1);
                        
                        // Note: If we just removed old, the grid is logically changed.
                        // Ideally we should reflect that when calculating 'add new'.
                        // But we haven't updated grid yet.
                        // Standard Delta Eval:
                        // Cost(S') = Cost(S) - Cost(contribution_old) + Cost(contribution_new)
                        // But overlap depends on others. 
                        // Overlap_New = Overlap_Current - (overlap at old pos caused by me) + (overlap at new pos caused by me AFTER removing old)
                        
                        // Problem: calcGridDelta for 'new' reads the grid which HAS the 'old' band.
                        // If ranges overlap, we might double count or miss.
                        // We must be careful. 
                        // If old and new positions overlap in time AND day, simply summing deltas is risky if not handled carefully.
                        // BUT, Int16 grid counts.
                        // If grid[t] is 2. Remove me -> 1. Penalty reduced.
                        // Add me somewhere else -> 2. Penalty increased.
                        // If I move within same day overlapping myself?
                        // grid[t] is 1 (only me). Remove me -> 0. Add me -> 1. No penalty change. Correct.
                        // grid[t] is 2 (me + other). Remove me -> 1. Penalty -1. Add me -> 2. Penalty +1. Net 0. Correct.
                        // So separate calculation is safe because 'me' is included in current grid.
                        // Wait. when we calc 'add new', grid still has 'me' at old pos.
                        // If new pos overlaps old pos:
                        // Index t: grid[t]=1 (me). 
                        // Remove old: delta -0 (grid becomes 0).
                        // Add new (at t): grid currently 1. Add -> delta +P (grid becomes 2). 
                        // Net delta +P.
                        // Logic state: old was 1, new is 1. No overlap. P should be 0.
                        // ERROR! If old and new positions overlap, simply reading current grid for 'add' is wrong because current grid includes 'me' at old pos.
                        
                        // FIX: We must temporarily update grid OR be smart.
                        // Temporary update is easiest and robust. 
                        // Is it faster than complex logic? Yes.
                        // Since we split apply/calc, we can do:
                        // 1. applyGridUpdate(remove)
                        // 2. calcGridDelta(add) -> this gives correct delta for adding into "clean" grid
                        // 3. check acceptance
                        // 4. if accept: applyGridUpdate(add) (effectively commit)
                        // 5. if reject: applyGridUpdate(add old back) (revert removal)
                        
                        // Optimization: We still need 'deltaOverlap' from removal too.
                        // We can calc removal delta AND apply removal.
                        
                        // Step 1: Remove Old
                        const removeDelta = calcGridDelta(targetIdx, oldD, oldS, -1);
                        applyGridUpdate(targetIdx, oldD, oldS, -1);
                        
                        // Step 2: Calculate Add (on clean grid)
                        const addDelta = calcGridDelta(targetIdx, newD, newS, 1);
                        
                        const totalOverlapDelta = removeDelta + addDelta;

                        // 2. Base Cost Delta
                        const { cost: newBaseCost, isOut: newIsOut } = getBaseCost(targetIdx, newD, newS);
                        const oldBaseCost = currentBandCosts[targetIdx];

                        const newSum = sumBandCost - oldBaseCost + newBaseCost;
                        const newSqSum = sumBandCostSq - (oldBaseCost*oldBaseCost) + (newBaseCost*newBaseCost);
                        
                        const newTotalCost = calcTotal(newSum, newSqSum, overlapPenaltyTotal + totalOverlapDelta);
                        const delta = newTotalCost - currentTotalCost;

                        if (delta < 0 || Math.random() < Math.exp(-delta / temp)) {
                            // Accept
                            applyGridUpdate(targetIdx, newD, newS, 1); // Commit new
                            
                            solDays[targetIdx] = newD;
                            solStarts[targetIdx] = newS;
                            currentBandCosts[targetIdx] = newBaseCost;
                            sumBandCost = newSum;
                            sumBandCostSq = newSqSum;
                            overlapPenaltyTotal += totalOverlapDelta;
                            currentTotalCost = newTotalCost;
                            
                            if (isOutsidePref[targetIdx] !== (newIsOut?1:0)) {
                                totalOutsideCount += (newIsOut?1:-1);
                                isOutsidePref[targetIdx] = newIsOut ? 1 : 0;
                            }

                            if (currentTotalCost < bestCost) {
                                bestCost = currentTotalCost;
                                bestSolDays.set(solDays);
                                bestSolStarts.set(solStarts);
                            }
                        } else {
                            // Reject - Revert: Add Old Back
                            applyGridUpdate(targetIdx, oldD, oldS, 1);
                        }

                    } else {
                        // --- SWAP ---
                        const idx1 = (Math.random() * N) | 0;
                        let idx2 = (Math.random() * N) | 0;

                        if (isFixedArr[idx1] === 1 || isFixedArr[idx2] === 1) continue;
                        if (idx1 === idx2) continue;

                        const d1 = solDays[idx1]; const s1 = solStarts[idx1];
                        const d2 = solDays[idx2]; const s2 = solStarts[idx2];

                        // Check Fit
                        const dur1 = bandDurations[idx1];
                        const dur2 = bandDurations[idx2];
                        const slots1 = (d1 === -1) ? 0 : dailySlots[d1];
                        const slots2 = (d2 === -1) ? 0 : dailySlots[d2];

                        if (d2 !== -1 && slots2 < dur1) continue;
                        if (d1 !== -1 && slots1 < dur2) continue;
                        if (d2 !== -1 && s2 + dur1 > slots2) continue;
                        if (d1 !== -1 && s1 + dur2 > slots1) continue;

                        // Same logic: Unassign both, then calc add both
                        
                        // 1. Remove both
                        const rem1 = calcGridDelta(idx1, d1, s1, -1);
                        applyGridUpdate(idx1, d1, s1, -1);
                        
                        const rem2 = calcGridDelta(idx2, d2, s2, -1);
                        applyGridUpdate(idx2, d2, s2, -1);
                        
                        // 2. Add swapped
                        const add1 = calcGridDelta(idx1, d2, s2, 1);
                        applyGridUpdate(idx1, d2, s2, 1); // Temp apply for accurate second calc if flexible?
                        // Actually if we add idx1, then adding idx2 might overlap idx1.
                        // So we MUST apply idx1 before calculating idx2's delta.
                        
                        const add2 = calcGridDelta(idx2, d1, s1, 1);
                        // Don't apply add2 yet, we just needed delta. 
                        // But wait, if we accept, we need to apply add2.
                        // If we reject, we need to revert add1 and apply old1, old2.
                        
                        const totalOverlapDelta = rem1 + rem2 + add1 + add2;

                        // Base Cost
                        const { cost: c1, isOut: o1 } = getBaseCost(idx1, d2, s2);
                        const { cost: c2, isOut: o2 } = getBaseCost(idx2, d1, s1);
                        
                        const oldC1 = currentBandCosts[idx1];
                        const oldC2 = currentBandCosts[idx2];

                        const newSum = sumBandCost - oldC1 - oldC2 + c1 + c2;
                        const newSqSum = sumBandCostSq - (oldC1*oldC1) - (oldC2*oldC2) + (c1*c1) + (c2*c2);

                        const newTotalCost = calcTotal(newSum, newSqSum, overlapPenaltyTotal + totalOverlapDelta);
                        const delta = newTotalCost - currentTotalCost;

                        if (delta < 0 || Math.random() < Math.exp(-delta / temp)) {
                            // Accept
                            applyGridUpdate(idx2, d1, s1, 1); // Apply valid add2 (add1 already applied)
                            
                            solDays[idx1] = d2; solStarts[idx1] = s2;
                            solDays[idx2] = d1; solStarts[idx2] = s1;
                            
                            currentBandCosts[idx1] = c1;
                            currentBandCosts[idx2] = c2;
                            sumBandCost = newSum;
                            sumBandCostSq = newSqSum;
                            overlapPenaltyTotal += totalOverlapDelta;
                            currentTotalCost = newTotalCost;
                            
                            if (isOutsidePref[idx1] !== (o1?1:0)) {
                                totalOutsideCount += (o1?1:-1);
                                isOutsidePref[idx1] = o1 ? 1 : 0;
                            }
                            if (isOutsidePref[idx2] !== (o2?1:0)) {
                                totalOutsideCount += (o2?1:-1);
                                isOutsidePref[idx2] = o2 ? 1 : 0;
                            }

                            if (currentTotalCost < bestCost) {
                                bestCost = currentTotalCost;
                                bestSolDays.set(solDays);
                                bestSolStarts.set(solStarts);
                            }
                        } else {
                            // Reject - Revert
                            applyGridUpdate(idx1, d2, s2, -1); // Revert add1
                            // Revert adds (add2 was never applied)
                            
                            // Apply back olds
                            applyGridUpdate(idx1, d1, s1, 1);
                            applyGridUpdate(idx2, d2, s2, 1);
                        }
                    }
                }

                onProgress((i / iterations) * 100, bestCost);

                if (i < iterations) {
                    if (runSynchronous) {
                        step();
                    } else {
                        setTimeout(step, 0);
                    }
                } else {
                    // Final Result Construction
                    const finalSol: Solution = {};
                    for (let k = 0; k < N; k++) {
                        if (bestSolDays[k] !== -1) {
                            finalSol[bandIds[k]] = { day: bestSolDays[k], start: bestSolStarts[k] };
                        } else {
                            finalSol[bandIds[k]] = null;
                        }
                    }
                    // Validate Result
                    const { outsideCount: fOut, hasOverlap: fOver } = this.calculateCost(finalSol, bands, currentDurs);
                    resolve({ solution: finalSol, cost: bestCost, outsideCount: fOut, hasOverlap: fOver });
                }
            };

            step();
        });
    }


}
