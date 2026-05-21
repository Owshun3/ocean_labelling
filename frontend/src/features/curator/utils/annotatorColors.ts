import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const ANNOTATOR_PALETTE: string[] = [
	'#ef4444',
	'#3b82f6',
	'#10b981',
	'#f59e0b',
	'#a855f7',
	'#ec4899',
];

export const CURATOR_COLOR = '#06b6d4';
export const ANNOTATOR_STROKE_WIDTH = 1.25;
export const CURATOR_STROKE_WIDTH   = 1.75;

const STORAGE_KEY = 'curator_annotator_color';

export function loadCuratorAnnotatorColor(): string {
	if (Platform.OS === 'web' && typeof window !== 'undefined') {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		if (stored && ANNOTATOR_PALETTE.includes(stored)) return stored;
	}
	return ANNOTATOR_PALETTE[1];
}

export async function loadCuratorAnnotatorColorAsync(): Promise<string> {
	if (Platform.OS === 'web') return loadCuratorAnnotatorColor();
	try {
		const stored = await SecureStore.getItemAsync(STORAGE_KEY);
		if (stored && ANNOTATOR_PALETTE.includes(stored)) return stored;
	} catch {}
	return ANNOTATOR_PALETTE[1];
}

export function saveCuratorAnnotatorColor(color: string): void {
	if (!ANNOTATOR_PALETTE.includes(color)) return;
	if (Platform.OS === 'web') {
		if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, color);
		return;
	}
	SecureStore.setItemAsync(STORAGE_KEY, color).catch(() => {});
}
