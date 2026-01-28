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
            let currentSolution = initialSol ? JSON.parse(JSON.stringify(initialSol)) : {};
            
            if (!initialSol) {
                bands.forEach(b => {
                    const bid = String(b.id);
                    const day = Math.floor(Math.random() * this.days);
                    const dur = currentDurs[bid];
                    const slots = this.dailyConfigs[day].slots;
                    const maxStart = slots - dur;
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

            let { cost: currentCost, outsideCount: currentOutside, hasOverlap: currentHasOverlap } = this.calculateCost(currentSolution, bands, currentDurs);
            let bestSolution = JSON.parse(JSON.stringify(currentSolution));
            let bestCost = currentCost;
            let bestOutside = currentOutside;
            let bestHasOverlap = currentHasOverlap;

            // Original settings
            const iterations = 10000;
            const startTemp = 100;
            // Standard linear cooling often used in simple demos, but exponential is better?
            // User asked to revert, so we revert to logic similar to original but keeping valid JS
            // Original code used: temp = startTemp * (1 - (i / iterations));
            
            let i = 0;
            const batchSize = runSynchronous ? 20000 : 5000;
            const bandIds = bands.map(b => String(b.id));
            
            const step = () => {
                const end = Math.min(i + batchSize, iterations);

                for (; i < end; i++) {
                    // Reverted to Linear cooling schedule
                    let temp = startTemp * (1 - (i / iterations));
                    if (temp <= 0.001) temp = 0.001;

                    const neighborSolution = { ...currentSolution };
                    const targetBid = bandIds[Math.floor(Math.random() * bandIds.length)];
                    
                    if (Math.random() < 0.5) {
                        const newDay = Math.floor(Math.random() * this.days);
                        const dur = currentDurs[targetBid];
                        const slots = this.dailyConfigs[newDay].slots;
                        const maxStart = slots - dur;
                        if (maxStart >= 0) {
                            neighborSolution[targetBid] = {
                                day: newDay,
                                start: Math.floor(Math.random() * (maxStart + 1))
                            };
                        }
                    } else {
                        const targetBid2 = bandIds[Math.floor(Math.random() * bandIds.length)];
                        if (targetBid !== targetBid2) {
                            const b1 = neighborSolution[targetBid];
                            const b2 = neighborSolution[targetBid2];
                            if (b1 && b2) {
                                const d1 = currentDurs[targetBid];
                                const d2 = currentDurs[targetBid2];
                                const slots1 = this.dailyConfigs[b2.day].slots; // b1 moving to b2.day
                                const slots2 = this.dailyConfigs[b1.day].slots; // b2 moving to b1.day

                                if ((b2.start + d1 <= slots1) && (b1.start + d2 <= slots2)) {
                                    neighborSolution[targetBid] = { day: b2.day, start: b2.start };
                                    neighborSolution[targetBid2] = { day: b1.day, start: b1.start };
                                }
                            }
                        }
                    }

                    const { cost: neighborCost, outsideCount: neighborOutside } = this.calculateCost(neighborSolution, bands, currentDurs);
                    const delta = neighborCost - currentCost;
                    
                    if (delta < 0 || Math.random() < Math.exp(-delta / temp)) {
                        currentSolution = neighborSolution;
                        currentCost = neighborCost;
                        // Keep track of BEST ever encountered solution
                        if (currentCost < bestCost) {
                            const { hasOverlap: nbOverlap } = this.calculateCost(neighborSolution, bands, currentDurs);
                            // Only update best if it's better AND (doesn't introduce overlap if previous best had none? or just pure cost?)
                            // Actually cost includes overlap penalty heavily. So lower cost usually means less overlap.
                            // But we need to update stored meta-data
                            
                            bestSolution = JSON.parse(JSON.stringify(currentSolution));
                            bestCost = currentCost;
                            bestOutside = neighborOutside; 
                            bestHasOverlap = nbOverlap;
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
                    const { outsideCount: finalBestOutside, hasOverlap: finalHasOverlap } = this.calculateCost(bestSolution, bands, currentDurs);
                    resolve({ solution: bestSolution, cost: bestCost, outsideCount: finalBestOutside, hasOverlap: finalHasOverlap });
                }
            };
            step();
        });
    }


}
