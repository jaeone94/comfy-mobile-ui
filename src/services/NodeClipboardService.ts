export interface CopiedNode {
    id: string;
    timestamp: number;
    originalNodeId: number;
    type: string;
    title: string;
    widgets: Record<string, any>;
    color?: string;
    size?: number[];
}

const STORAGE_KEY = 'comfy_mobile_node_clipboard';
const MAX_COPIES = 3;

import { generateUUID } from '@/utils/uuid';

// Removed internal generateUUID function


export const NodeClipboardService = {
    saveNode: (node: Omit<CopiedNode, 'id' | 'timestamp'>) => {
        try {
            const existingData = localStorage.getItem(STORAGE_KEY);
            let copies: CopiedNode[] = existingData ? JSON.parse(existingData) : [];

            const newCopy: CopiedNode = {
                ...node,
                id: generateUUID(),
                timestamp: Date.now()
            };

            // Add to beginning
            copies.unshift(newCopy);

            // Limit to MAX_COPIES
            if (copies.length > MAX_COPIES) {
                copies = copies.slice(0, MAX_COPIES);
            }

            localStorage.setItem(STORAGE_KEY, JSON.stringify(copies));
            return true;
        } catch (error) {
            console.error('Failed to save to clipboard:', error);
            return false;
        }
    },

    getNodes: (): CopiedNode[] => {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Failed to get clipboard nodes:', error);
            return [];
        }
    },

    clear: () => {
        localStorage.removeItem(STORAGE_KEY);
    }
};
