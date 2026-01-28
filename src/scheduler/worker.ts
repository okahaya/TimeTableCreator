import { SchedulerLogic } from './logic';

self.onmessage = async (e: MessageEvent) => {
    const { 
        id, // worker identifier (e.g. trial index)
        bands, 
        currentDurs, 
        setup // { dailyConfigs, intervalMin, costParams }
    } = e.data;

    try {
        // Reconstruct dailyConfigs from raw objects because methods are lost in postMessage
        // The worker.ts logic calls 'new SchedulerLogic' but it expects 'dailyTimes' not 'dailyConfigs'
        // If we look at the constructor: constructor(dailyTimes: { start: string; end: string; ... }[], ...)
        // BUT in App.tsx we passed `setup: { dailyConfigs, ... }` where dailyConfigs is already parsed array {slots, startMin...}
        // This is a type mismatch.
        
        // Let's reconstruct dailyTimes format or change constructor usage?
        // Changing worker to adapt to "pre-calculated" config is safer or convert back.
        // But SchedulerLogic calculates logic from time strings.

        // We need to fix the postMessage in App.tsx or handle it here.
        // In App.tsx:
        /*
            const setupConfig = {
                dailyConfigs: logic.dailyConfigs, // This is [{ slots: 100, startMin: 600... }]
                ...
            };
        */
        
        // This won't match `dailyTimes: { start: string; end: string }[]` expected by SchedulerLogic constructor.
        // We must pass the raw times.
        
        // Fix: Use a modified constructor or reconstruct dummy times.
        // Actually, logic.ts constructor parses string like "10:00".
        // We can pass the raw "dailyTimes" from the original stage object if possible, 
        // OR we can make a "HydratedSchedulerLogic" that accepts pre-calculated config.
        
        // Easiest fix: Since we don't have easy access to original string times inside `setup` (unless passed),
        // let's just make a mock dailyTimes from the calculated values to satisfy constructor.
        
        const reconstructedDailyTimes = setup.dailyConfigs.map((dc: any) => {
             const sh = Math.floor(dc.startMin / 60);
             const sm = dc.startMin % 60;
             const eh = Math.floor(dc.endMin / 60);
             const em = dc.endMin % 60;
             return {
                 start: `${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`,
                 end: `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`,
                 date: dc.date
             };
        });

        const scheduler = new SchedulerLogic(
            reconstructedDailyTimes,
            setup.intervalMin,
            setup.costParams
        );

        let lastTime = 0;
        
        // Run synchronously to maximize speed in worker
        const result = await scheduler.optimize(
            bands,
            currentDurs,
            (progress, score) => {
                const now = Date.now();
                // 100msごとに間引き (約10fps) - UIスレッドの負担軽減
                if (now - lastTime > 100 || progress === 100) {
                    self.postMessage({ type: 'progress', id, progress, score });
                    lastTime = now;
                }
            },
            undefined, 
            true // runSynchronous
        );

        self.postMessage({ type: 'done', id, result });
    } catch (error) {
        self.postMessage({ type: 'error', id, error: String(error) });
    }
};
