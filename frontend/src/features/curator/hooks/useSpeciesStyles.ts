import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ANNOTATOR_PALETTE } from '../utils/annotatorColors';

export interface SpeciesStyle {
	color:   string;
	opacity: number;
}

export const DEFAULT_OPACITY = 0.85;

function paletteColorFor(speciesKey: string): string {
	if (!speciesKey) return ANNOTATOR_PALETTE[1];
	let h = 0;
	for (let i = 0; i < speciesKey.length; i++) {
		h = (h * 31 + speciesKey.charCodeAt(i)) | 0;
	}
	return ANNOTATOR_PALETTE[Math.abs(h) % ANNOTATOR_PALETTE.length];
}

export function defaultStyleFor(speciesKey: string): SpeciesStyle {
	return { color: paletteColorFor(speciesKey), opacity: DEFAULT_OPACITY };
}

const STORAGE_KEY = 'curator_species_styles';

function loadFromSession(): Record<string, SpeciesStyle> {
	if (Platform.OS !== 'web' || typeof window === 'undefined') return {};
	try {
		const raw = window.sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object') return parsed;
	} catch {}
	return {};
}

function saveToSession(map: Record<string, SpeciesStyle>): void {
	if (Platform.OS !== 'web' || typeof window === 'undefined') return;
	try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

export interface SpeciesStylesApi {
	resolve: (speciesKey: string) => SpeciesStyle;
	set:     (speciesKey: string, patch: Partial<SpeciesStyle>) => void;
	reset:   (speciesKey: string) => void;
}

export function useSpeciesStyles(): SpeciesStylesApi {
	const [styles, setStyles] = useState<Record<string, SpeciesStyle>>(() => loadFromSession());
	const stylesRef = useRef(styles);
	stylesRef.current = styles;

	useEffect(() => { saveToSession(styles); }, [styles]);

	const resolve = useCallback((speciesKey: string): SpeciesStyle => {
		return stylesRef.current[speciesKey] ?? defaultStyleFor(speciesKey);
	}, []);

	const set = useCallback((speciesKey: string, patch: Partial<SpeciesStyle>) => {
		setStyles((prev) => {
			const current = prev[speciesKey] ?? defaultStyleFor(speciesKey);
			return { ...prev, [speciesKey]: { ...current, ...patch } };
		});
	}, []);

	const reset = useCallback((speciesKey: string) => {
		setStyles((prev) => {
			const next = { ...prev };
			delete next[speciesKey];
			return next;
		});
	}, []);

	return { resolve, set, reset };
}
