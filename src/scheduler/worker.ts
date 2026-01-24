import { SchedulerLogic } from './logic';

self.onmessage = async (e: MessageEvent) => {
    const { 
        id, // worker identifier (e.g. trial index)
        bands, 
        currentDurs, 
        setup // { dailyConfigs, intervalMin, costParams }
    } = e.data;

    try {
        const scheduler = new SchedulerLogic(
            setup.dailyConfigs,
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
