export interface Rank {
	id: 'debutant' | 'bronze' | 'argent' | 'or' | 'platine';
	label: string;
	threshold: number;
	color: string;
}

export const RANKS: Rank[] = [
	{ id: 'debutant', label: 'Débutant', threshold: 0,    color: '#9ca3af' },
	{ id: 'bronze',   label: 'Bronze',   threshold: 50,   color: '#cd7f32' },
	{ id: 'argent',   label: 'Argent',   threshold: 200,  color: '#c0c0c0' },
	{ id: 'or',       label: 'Or',       threshold: 500,  color: '#f59e0b' },
	{ id: 'platine',  label: 'Platine',  threshold: 3000, color: '#06b6d4' },
];

export interface RankProgress {
	current: Rank;
	next: Rank | null;
	actions: number;
	toNext: number;
	progressPct: number;
}

export function computeRank(actions: number): RankProgress {
	const safe = Math.max(0, actions | 0);
	let current = RANKS[0];
	let next: Rank | null = RANKS[1] ?? null;
	for (let i = RANKS.length - 1; i >= 0; i--) {
		if (safe >= RANKS[i].threshold) {
			current = RANKS[i];
			next = RANKS[i + 1] ?? null;
			break;
		}
	}
	const toNext = next ? Math.max(0, next.threshold - safe) : 0;
	const progressPct = next
		? Math.min(100, Math.max(0, ((safe - current.threshold) / (next.threshold - current.threshold)) * 100))
		: 100;
	return { current, next, actions: safe, toNext, progressPct };
}
