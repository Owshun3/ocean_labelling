export const ANNOTATOR_PALETTE: string[] = [
	'#ef4444',
	'#3b82f6',
	'#10b981',
	'#f59e0b',
	'#a855f7',
	'#ec4899',
];

export const CURATOR_COLOR = '#06b6d4';
export const CURATOR_STROKE_WIDTH = 3;

const STORAGE_KEY = 'curator_annotator_color';

export function loadCuratorAnnotatorColor(): string {
	if (typeof window === 'undefined') return ANNOTATOR_PALETTE[1];
	const stored = window.localStorage.getItem(STORAGE_KEY);
	if (stored && ANNOTATOR_PALETTE.includes(stored)) return stored;
	return ANNOTATOR_PALETTE[1];
}

export function saveCuratorAnnotatorColor(color: string): void {
	if (typeof window === 'undefined') return;
	if (!ANNOTATOR_PALETTE.includes(color)) return;
	window.localStorage.setItem(STORAGE_KEY, color);
}
