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
export class SchedulerLogic {
    startHour: number;
    startMin: number;
    endHour: number;
    endMin: number;
    days: number;
    intervalSlots: number;
    dailySlots: number;
    startOffsetMinutes: number;
    
    // Cost Parameters
    PENALTY_OVERLAP: number;
    PENALTY_UNASSIGNED: number;
    PENALTY_OUTSIDE_PREF: number;
    PRIORITY_COSTS: number[];
    PENALTY_OVERFLOW: number;
    PENALTY_EQUITY: number;

    constructor(
        startTimeStr = "10:00",
        endTimeStr = "18:00",
        days = 2,
        intervalMin = 0,
        costParams?: Partial<CostParams>
    ) {
        const [sh, sm] = startTimeStr.split(":").map(Number);
        const [eh, em] = endTimeStr.split(":").map(Number);
        
        this.startHour = sh;
        this.startMin = sm;
        this.endHour = eh;
        this.endMin = em;
        this.days = days;
        this.intervalSlots = Math.floor(intervalMin / 5);

        const startMinutes = sh * 60 + sm;
        const endMinutes = eh * 60 + em;
        this.dailySlots = Math.floor((endMinutes - startMinutes) / 5);
        this.startOffsetMinutes = startMinutes;

        const defaults: CostParams = {
            PENALTY_OVERLAP: 100000,
            PENALTY_UNASSIGNED: 50000,
            PENALTY_OUTSIDE_PREF: 4000,
            PRIORITY_COST_1: 0,
            PRIORITY_COST_2: 300,
            PRIORITY_COST_3: 900,
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

    timeStrToIdx(timeStr: string): number {
        try {
            const [h, m] = timeStr.split(":").map(Number);
            const minutes = h * 60 + m;
            return Math.floor((minutes - this.startOffsetMinutes) / 5);
        } catch {
            return -1;
        }
    }

    idxToTimeStr(idx: number): string {
        const totalMinutes = this.startOffsetMinutes + idx * 5;
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
    ): { cost: number; grid: number[][] } {
        let cost = 0;
        
        // Grid: returns number[day][slot]
        const grid: number[][] = Array.from({ length: this.days }, () =>
            new Array(this.dailySlots).fill(0)
        );

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

            if (start < 0 || end > this.dailySlots) {
                thisBandCost += this.PENALTY_UNASSIGNED;
                cost += this.PENALTY_UNASSIGNED;
                bandCosts.push(thisBandCost);
                continue;
            }

            // Fill Grid (Occupancy + Interval)
            const occupyEnd = Math.min(end + this.intervalSlots, this.dailySlots);
            for (let t = Math.floor(start); t < Math.floor(occupyEnd); t++) {
                if (t >= 0 && t < this.dailySlots) {
                    grid[day][t] += 1;
                }
            }

            // 3. Match Preference
            const originalDuration = Math.floor(band.duration_min / 5);
            let bestReqCost = Infinity;
            let foundMatchingDay = false;

            for (let i = 0; i < band.requests.length; i++) {
                if (i >= this.PRIORITY_COSTS.length) break;
                const req = band.requests[i];
                const reqDay = req.day - 1;

                if (day === reqDay) {
                    foundMatchingDay = true;
                    const reqStart = this.timeStrToIdx(req.start);
                    const reqEnd = reqStart + originalDuration;

                    const overflow = Math.max(0, reqStart - start) + Math.max(0, end - reqEnd);
                    const reqCost = this.PRIORITY_COSTS[i] + (overflow * this.PENALTY_OVERFLOW);

                    if (reqCost < bestReqCost) {
                        bestReqCost = reqCost;
                    }
                }
            }

            if (foundMatchingDay) {
                thisBandCost += bestReqCost;
            } else {
                thisBandCost += this.PENALTY_OUTSIDE_PREF;
            }

            cost += thisBandCost;
            bandCosts.push(thisBandCost);
        }

        // 1. Overlap Penalty
        for (let d = 0; d < this.days; d++) {
            for (let t = 0; t < this.dailySlots; t++) {
                if (grid[d][t] > 1) {
                    cost += (grid[d][t] - 1) * this.PENALTY_OVERLAP;
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

        return { cost, grid };
    }
}
