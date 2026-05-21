// Miroir UI de app-api/src/lib/permissions.js — ergonomie pure pour griser
// les boutons. Le backend reste source de vérité.

const ROLE_RANK: Record<string, number> = {
	admin:     5,
	moderator: 4,
	curator:   3,
	chercheur: 3,
	annotator: 1,
	guest:     0,
};

export function roleRank(role: string | null | undefined): number {
	if (!role) return 0;
	return ROLE_RANK[role] ?? 0;
}

export interface SanctionActor {
	id: number;
	role: string;
	is_superuser?: boolean;
	is_staff?: boolean;
}
export interface SanctionTarget {
	id: number;
	role: string;
	is_superuser?: boolean;
	is_staff?: boolean;
}

export interface SanctionPermission {
	allowed: boolean;
	reason: string | null;
}

export function canSanction(actor: SanctionActor, target: SanctionTarget, actionLabel = 'sanctionner'): SanctionPermission {
	if (Number(actor.id) === Number(target.id)) {
		return { allowed: false, reason: `Tu ne peux pas te ${actionLabel} toi-même.` };
	}
	if (target.is_superuser || target.is_staff) {
		return { allowed: false, reason: `Un administrateur ne peut pas être ${pastParticipleFor(actionLabel)} depuis l'UI.` };
	}
	const actorRank  = actor.is_superuser ? ROLE_RANK.admin : roleRank(actor.role);
	const targetRank = roleRank(target.role);
	if (actorRank <= targetRank) {
		return { allowed: false, reason: `Ton rôle ne permet pas de ${actionLabel} un ${target.role} (seuls les rôles strictement supérieurs le peuvent).` };
	}
	return { allowed: true, reason: null };
}

function pastParticipleFor(verb: string): string {
	if (verb === 'bannir')     return 'banni';
	if (verb === 'désactiver') return 'désactivé';
	return 'sanctionné';
}
