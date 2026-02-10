import { useState, useEffect } from 'react';
import { Solution, Band } from '../scheduler/logic';

// App.tsx と同じ型定義が必要 (App.tsxからinterfaceをexportしてないのでここで再定義)
export type StageConfig = {
    id: string;
    name: string;
    dailyTimes: { start: string, end: string }[];
    reductionRate: number;
    intervalMin: number;
};

export interface PersistentHistoryItem {
    id: string; // timestamp string
    createdAt: number;
    name: string;
    // Snapshot of Application State
    solution: Solution;
    bands: (Band & { assignedStageId: string })[];
    durations: Record<string, number>;
    stages: StageConfig[];
    days: number;
    eventDates: string[];
    score: number;
}

const STORAGE_KEY = 'timetable_history_v1';

export function usePersistentHistory() {
    const [historyItems, setHistoryItems] = useState<PersistentHistoryItem[]>([]);

    useEffect(() => {
        // Load initial
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                setHistoryItems(JSON.parse(raw));
            }
        } catch (e) {
            console.error("Failed to load history", e);
        }
    }, []);

    const saveHistory = (item: Omit<PersistentHistoryItem, 'id' | 'createdAt'>) => {
        const newItem: PersistentHistoryItem = {
            ...item,
            id: Date.now().toString(),
            createdAt: Date.now(),
        };
        
        setHistoryItems(prev => {
            const next = [newItem, ...prev].slice(0, 50); // Max 50 items
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch (e) {
                console.error("Failed to save history (quota exceeded?)", e);
                // If quota exceeded, simply alert
                alert("ブラウザの保存容量が不足しているため、履歴を保存できませんでした。古い履歴を削除してください。");
                return prev;
            }
            return next;
        });
    };

    const deleteHistory = (id: string) => {
        setHistoryItems(prev => {
            const next = prev.filter(item => item.id !== id);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };

    const restoreHistory = (id: string): PersistentHistoryItem | undefined => {
        return historyItems.find(item => item.id === id);
    };

    const renameHistory = (id: string, newName: string) => {
        setHistoryItems(prev => {
            const next = prev.map(item => item.id === id ? { ...item, name: newName } : item);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };
    
    const clearHistory = () => {
        localStorage.removeItem(STORAGE_KEY);
        setHistoryItems([]);
    };

    return {
        historyItems,
        saveHistory,
        deleteHistory,
        restoreHistory,
        renameHistory,
        clearHistory
    };
}
