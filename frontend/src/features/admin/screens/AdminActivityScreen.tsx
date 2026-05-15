import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { AdminService, AuditEntry, AuditAction } from '@/services/api/AdminService';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<AuditAction, string> = {
	'user.banned':            'Utilisateur banni',
	'user.active_changed':    'État de compte modifié',
	'user.role_changed':      'Rôle modifié',
	'contestation.resolved':  'Contestation résolue',
	'setting.changed':        'Paramètre modifié',
	'media.validated':        'Médias validés',
	'media.rejected':         'Médias rejetés',
	'media.auto_deleted':     'Nettoyage automatique',
	'curation.assigned':      'Curation attribuée',
	'species.edited':         'Fiche espèce éditée',
	'species_edit.proposed':  'Demande d\'édition espèce',
	'species_edit.withdrawn': 'Demande retirée',
	'species_edit.resolved':  'Demande espèce résolue',
};

const ACTION_COLORS: Record<AuditAction, string> = {
	'user.banned':            COLORS.danger,
	'user.active_changed':    '#0284c7',
	'user.role_changed':      '#7c3aed',
	'contestation.resolved':  '#f59e0b',
	'setting.changed':        '#0ea5e9',
	'media.validated':        '#16a34a',
	'media.rejected':         COLORS.danger,
	'media.auto_deleted':     '#6b7280',
	'curation.assigned':      '#0ea5e9',
	'species.edited':         '#16a34a',
	'species_edit.proposed':  '#f59e0b',
	'species_edit.withdrawn': '#6b7280',
	'species_edit.resolved':  '#7c3aed',
};

const FILTER_OPTIONS: { value: AuditAction | ''; label: string }[] = [
	{ value: '',                        label: 'Tout' },
	{ value: 'user.banned',             label: 'Bans' },
	{ value: 'user.active_changed',     label: 'État compte' },
	{ value: 'user.role_changed',       label: 'Rôle' },
	{ value: 'contestation.resolved',   label: 'Contestations' },
	{ value: 'setting.changed',         label: 'Paramètres' },
	{ value: 'media.validated',         label: 'Validations' },
	{ value: 'media.rejected',          label: 'Rejets' },
	{ value: 'media.auto_deleted',      label: 'Nettoyage auto' },
	{ value: 'curation.assigned',       label: 'Attributions' },
	{ value: 'species.edited',          label: 'Édits espèces' },
	{ value: 'species_edit.proposed',   label: 'Demandes espèces' },
	{ value: 'species_edit.resolved',   label: 'Demandes résolues' },
];

interface ResourceLink {
	label: string;
	href: Href | null;
}

function describeResource(entry: AuditEntry): ResourceLink | null {
	const p = entry.payload || {};
	switch (entry.action) {
		case 'user.banned':
		case 'user.active_changed':
		case 'user.role_changed':
			return entry.target_id ? { label: `Utilisateur #${entry.target_id}`, href: null } : null;
		case 'contestation.resolved':
			return { label: 'Voir les contestations', href: '/(main)/admin/requests' as Href };
		case 'setting.changed':
			return p.key ? { label: `Paramètre : ${p.key}`, href: '/(main)/admin/settings' as Href } : null;
		case 'media.validated':
		case 'media.rejected': {
			const ids = Array.isArray(p.task_ids) ? p.task_ids : [];
			return ids.length > 0 ? { label: `Médias #${ids.slice(0, 3).join(', ')}${ids.length > 3 ? '…' : ''}`, href: null } : null;
		}
		case 'curation.assigned':
			return entry.target_id ? { label: `Curator #${entry.target_id}`, href: '/(main)/admin/curation' as Href } : null;
		case 'species.edited':
		case 'species_edit.proposed':
		case 'species_edit.withdrawn':
		case 'species_edit.resolved':
			return entry.target_id ? { label: `Fiche espèce #${entry.target_id}`, href: `/(main)/species/${entry.target_id}` as Href } : null;
		default:
			return null;
	}
}

function fmtTime(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function describePayload(entry: AuditEntry): string {
	const p = entry.payload || {};
	switch (entry.action) {
		case 'user.banned': {
			const target = entry.target_id ? `#${entry.target_id}` : '';
			const dur = p.duration_days ? `${p.duration_days} j` : (p.expires_at ? `jusqu'au ${new Date(p.expires_at).toLocaleDateString('fr-FR')}` : 'permanent');
			return `${target} — ${dur}${p.reason ? ` — « ${p.reason} »` : ''}`;
		}
		case 'user.active_changed':
			return `${entry.target_id ? `#${entry.target_id}` : ''} → ${p.is_active ? 'activé' : 'désactivé'}`;
		case 'user.role_changed':
			return `${entry.target_id ? `#${entry.target_id}` : ''} : ${p.from ?? '—'} → ${p.to ?? '—'}`;
		case 'contestation.resolved': {
			const ids = Array.isArray(p.contestation_ids) ? p.contestation_ids : [];
			const verdict = p.action === 'overturned' ? 'acceptée(s)' : 'rejet maintenu';
			return `${ids.length} contestation(s) — ${verdict}`;
		}
		case 'setting.changed':
			return `${p.key ?? '?'} : ${p.from ?? '—'} → ${p.to ?? '—'}`;
		case 'media.validated':
		case 'media.rejected':
			return `${p.count ?? p.task_ids?.length ?? 0} média(s)${p.reason ? ` — « ${p.reason} »` : ''}`;
		case 'media.auto_deleted':
			return `${p.deleted_count ?? 0} média(s) supprimé(s) après ${p.retention_days ?? '?'} j${p.errors ? ` — ${p.errors} échec(s)` : ''}`;
		case 'curation.assigned':
			return `${p.assigned ?? 0}/${p.requested ?? 0} média(s) attribué(s) à #${entry.target_id ?? '?'}${p.auto ? ' — auto' : ''}`;
		case 'species.edited': {
			const after  = p.after  ?? {};
			const before = p.before ?? {};
			const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
			return changed.length === 0 ? 'Aucun changement effectif' : `${changed.length} champ(s) modifié(s) : ${changed.join(', ')}`;
		}
		case 'species_edit.proposed': {
			const fields = Object.keys(p.payload ?? {});
			return `${fields.length} champ(s) proposé(s)${p.replaces_previous ? ' (mise à jour de la demande)' : ''}`;
		}
		case 'species_edit.withdrawn':
			return 'Demande retirée par le proposeur';
		case 'species_edit.resolved': {
			const verdict = p.action === 'approve' ? 'approuvée' : 'rejetée';
			return `Demande ${verdict}${p.comment ? ` — « ${p.comment} »` : ''}`;
		}
		default:
			return '';
	}
}

export const AdminActivityScreen: React.FC = () => {
	const router = useRouter();
	const service = useMemo(() => new AdminService(), []);
	const [entries, setEntries] = useState<AuditEntry[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [filter, setFilter] = useState<AuditAction | ''>('');

	const loadInitial = useCallback(async (action: AuditAction | '') => {
		setLoading(true);
		try {
			const resp = await service.listActivity({ limit: PAGE_SIZE, offset: 0, action: action || undefined });
			setEntries(resp.results);
			setTotal(resp.total);
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Chargement impossible.');
		} finally {
			setLoading(false);
		}
	}, [service]);

	useEffect(() => { loadInitial(filter); }, [loadInitial, filter]);

	const loadMore = async () => {
		if (loadingMore || entries.length >= total) return;
		setLoadingMore(true);
		try {
			const resp = await service.listActivity({ limit: PAGE_SIZE, offset: entries.length, action: filter || undefined });
			setEntries((prev) => [...prev, ...resp.results]);
			setTotal(resp.total);
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Chargement impossible.');
		} finally {
			setLoadingMore(false);
		}
	};

	if (loading) {
		return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	}

	return (
		<View style={styles.container}>
			<View style={styles.headerRow}>
				<Text style={styles.title}>Logs d'activité</Text>
				<Text style={styles.subtitle}>
					{total} action{total > 1 ? 's' : ''} enregistrée{total > 1 ? 's' : ''}
				</Text>
			</View>

			<View style={styles.filterBar}>
				{FILTER_OPTIONS.map((opt) => {
					const active = filter === opt.value;
					return (
						<Pressable
							key={opt.value || 'all'}
							onPress={() => setFilter(opt.value)}
							style={[styles.filterPill, active && styles.filterPillActive]}
						>
							<Text style={[styles.filterText, active && styles.filterTextActive]}>{opt.label}</Text>
						</Pressable>
					);
				})}
			</View>

			{entries.length === 0 ? (
				<View style={styles.empty}>
					<Text style={styles.emptyText}>Aucune action enregistrée pour ce filtre.</Text>
				</View>
			) : (
				<FlatList
					style={{ flex: 1 }}
					data={entries}
					keyExtractor={(e) => String(e.id)}
					contentContainerStyle={{ paddingBottom: SPACING.xl }}
					renderItem={({ item }) => {
						const resource = describeResource(item);
						return (
							<View style={styles.row}>
								<Text style={styles.rowTime}>{fmtTime(item.created_at)}</Text>
								<View style={[styles.actionBadge, { backgroundColor: `${ACTION_COLORS[item.action]}22`, borderColor: ACTION_COLORS[item.action] }]}>
									<Text style={[styles.actionBadgeText, { color: ACTION_COLORS[item.action] }]}>
										{ACTION_LABELS[item.action] ?? item.action}
									</Text>
								</View>
								<Text style={styles.rowActor}>
									par <Text style={styles.bold}>{item.actor.username ?? `#${item.actor.id}`}</Text> <Text style={styles.subdued}>· {item.actor.role}</Text>
								</Text>
								<Text style={styles.rowDescr}>{describePayload(item)}</Text>
								{resource ? (
									resource.href ? (
										<Pressable onPress={() => router.push(resource.href!)} style={styles.resourceLink}>
											<Text style={styles.resourceText}>{resource.label} ↗</Text>
										</Pressable>
									) : (
										<Text style={styles.resourceMuted}>{resource.label}</Text>
									)
								) : null}
							</View>
						);
					}}
					ListFooterComponent={
						entries.length < total ? (
							<Pressable onPress={loadMore} disabled={loadingMore} style={styles.loadMoreBtn}>
								<Text style={styles.loadMoreText}>
									{loadingMore ? 'Chargement…' : `Charger plus (${total - entries.length} restant·es)`}
								</Text>
							</Pressable>
						) : null
					}
				/>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg, gap: SPACING.sm },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

	headerRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
	title: { ...TYPOGRAPHY.h1 },
	subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },

	filterBar: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.sm },
	filterPill: {
		paddingHorizontal: SPACING.sm, paddingVertical: 4,
		borderRadius: 99,
		backgroundColor: COLORS.background.card,
		borderWidth: 1, borderColor: COLORS.border,
	},
	filterPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	filterText: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '600' },
	filterTextActive: { color: COLORS.text.inverse },

	row: {
		flexDirection: 'row',
		alignItems: 'center',
		flexWrap: 'wrap',
		gap: SPACING.sm,
		paddingVertical: SPACING.sm,
		paddingHorizontal: SPACING.md,
		backgroundColor: COLORS.background.card,
		borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
		marginBottom: SPACING.xs,
	},
	rowTime: { fontSize: 11, color: COLORS.text.placeholder, fontVariant: ['tabular-nums'], width: 140 },
	actionBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
	actionBadgeText: { fontSize: 11, fontWeight: '700' },
	rowActor: { fontSize: 12, color: COLORS.text.primary, minWidth: 180 },
	rowDescr: { fontSize: 12, color: COLORS.text.primary, flex: 1, fontStyle: 'italic' },
	bold: { fontWeight: '700' },
	subdued: { color: COLORS.text.secondary },

	resourceLink: {
		paddingHorizontal: SPACING.sm, paddingVertical: 2,
		borderRadius: 6, backgroundColor: COLORS.background.main,
		borderWidth: 1, borderColor: COLORS.border,
	},
	resourceText:  { fontSize: 11, color: COLORS.primary, fontWeight: '700' },
	resourceMuted: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '600' },

	loadMoreBtn: {
		marginTop: SPACING.md,
		paddingVertical: SPACING.sm,
		alignItems: 'center',
		backgroundColor: COLORS.background.card,
		borderRadius: 6, borderWidth: 1, borderColor: COLORS.border,
	},
	loadMoreText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },

	empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
});
