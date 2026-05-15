import { getPublicSettings, RankId } from '@/services/api/publicSettings';

export interface Rank {
	id: RankId;
	label: string;
	threshold: number;
	color: string;
}

// Les seuils sont figés (les modifier rétroactivement fausserait les rangs déjà affichés).
// Le libellé et la couleur viennent des paramètres système (overridable par l'admin).
const THRESHOLDS: Record<RankId, number> = {
	debutant: 0,
	bronze:   50,
	argent:   200,
	or:       500,
	platine:  3000,
};

const ORDER: RankId[] = ['debutant', 'bronze', 'argent', 'or', 'platine'];

function buildRanks(): Rank[] {
	const s = getPublicSettings();
	return ORDER.map((id) => ({
		id,
		label:     s[`rank.${id}.label` as const] ?? id,
		color:     s[`rank.${id}.color` as const] ?? '#9ca3af',
		threshold: THRESHOLDS[id],
	}));
}

export function getRanks(): Rank[] { return buildRanks(); }
// Conserve l'export `RANKS` en compat — recalcule à chaque accès via getter.
export const RANKS = new Proxy([] as Rank[], {
	get(_t, prop) { return Reflect.get(buildRanks(), prop); },
	has(_t, prop) { return Reflect.has(buildRanks(), prop); },
	ownKeys()     { return Reflect.ownKeys(buildRanks()); },
	getOwnPropertyDescriptor(_t, prop) { return Object.getOwnPropertyDescriptor(buildRanks(), prop); },
});

export interface RankProgress {
	current: Rank;
	next: Rank | null;
	actions: number;
	toNext: number;
	progressPct: number;
}

export function computeRank(actions: number): RankProgress {
	const ranks = buildRanks();
	const safe = Math.max(0, actions | 0);
	let current = ranks[0];
	let next: Rank | null = ranks[1] ?? null;
	for (let i = ranks.length - 1; i >= 0; i--) {
		if (safe >= ranks[i].threshold) {
			current = ranks[i];
			next = ranks[i + 1] ?? null;
			break;
		}
	}
	const toNext = next ? Math.max(0, next.threshold - safe) : 0;
	const progressPct = next
		? Math.min(100, Math.max(0, ((safe - current.threshold) / (next.threshold - current.threshold)) * 100))
		: 100;
	return { current, next, actions: safe, toNext, progressPct };
}
