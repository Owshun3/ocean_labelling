import { useCallback, useState } from 'react';

export type CuratorMode      = 'review' | 'drawing';
export type CuratorOpacity   = 'hidden' | 'dim' | 'normal';

export interface CuratorBbox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface CuratorModeState {
	mode: CuratorMode;
	opacity: CuratorOpacity;
	annotatorColor: string;
	selectedIds: Set<number>;
	curatorBbox: CuratorBbox | null;
	setOpacity:        (o: CuratorOpacity) => void;
	setAnnotatorColor: (color: string) => void;
	toggleSelected:    (id: number, mode: 'single' | 'toggle' | 'range', ordered?: number[]) => void;
	clearSelection:    () => void;
	enterDrawing:      () => void;
	exitDrawing:       () => void;
	setCuratorBbox:    (bbox: CuratorBbox | null) => void;
	updateCuratorBbox: (patch: Partial<CuratorBbox>) => void;
}

const OPACITY_VALUES: Record<CuratorOpacity, number> = {
	hidden: 0,
	dim:    0.5,
	normal: 1.0,
};

export function opacityToFloat(o: CuratorOpacity): number {
	return OPACITY_VALUES[o];
}

export function useCuratorMode(initialColor: string): CuratorModeState {
	const [mode, setMode] = useState<CuratorMode>('review');
	const [opacity, setOpacity] = useState<CuratorOpacity>('dim');
	const [annotatorColor, setAnnotatorColor] = useState<string>(initialColor);
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [curatorBbox, setCuratorBboxState] = useState<CuratorBbox | null>(null);
	const [lastClicked, setLastClicked] = useState<number | null>(null);

	const toggleSelected = useCallback((id: number, kind: 'single' | 'toggle' | 'range', ordered?: number[]) => {
		setSelectedIds((prev) => {
			if (kind === 'single') {
				setLastClicked(id);
				return prev.has(id) && prev.size === 1 ? new Set() : new Set([id]);
			}
			if (kind === 'toggle') {
				const next = new Set(prev);
				if (next.has(id)) next.delete(id); else next.add(id);
				setLastClicked(id);
				return next;
			}
			if (kind === 'range' && ordered && lastClicked !== null) {
				const a = ordered.indexOf(lastClicked);
				const b = ordered.indexOf(id);
				if (a < 0 || b < 0) return prev;
				const [start, end] = a < b ? [a, b] : [b, a];
				return new Set(ordered.slice(start, end + 1));
			}
			return prev;
		});
	}, [lastClicked]);

	const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

	const enterDrawing = useCallback(() => {
		setMode('drawing');
		setSelectedIds(new Set());
		setCuratorBboxState(null);
	}, []);

	const exitDrawing = useCallback(() => {
		setMode('review');
		setCuratorBboxState(null);
	}, []);

	const setCuratorBbox = useCallback((bbox: CuratorBbox | null) => {
		setCuratorBboxState(bbox);
	}, []);

	const updateCuratorBbox = useCallback((patch: Partial<CuratorBbox>) => {
		setCuratorBboxState((prev) => prev ? { ...prev, ...patch } : prev);
	}, []);

	return {
		mode, opacity, annotatorColor, selectedIds, curatorBbox,
		setOpacity, setAnnotatorColor,
		toggleSelected, clearSelection,
		enterDrawing, exitDrawing,
		setCuratorBbox, updateCuratorBbox,
	};
}
