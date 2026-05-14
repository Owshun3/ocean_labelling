import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { AdminService, AuditEntry, AuditAction } from '@/services/api/AdminService';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<AuditAction, string> = {
	'user.banned':           'Utilisateur banni',
	'user.active_changed':   'État de compte modifié',
	'user.role_changed':     'Rôle modifié',
	'contestation.resolved': 'Contestation résolue',
	'setting.changed':       'Paramètre modifié',
	'media.validated':       'Médias validés',
	'media.rejected':        'Médias rejetés',
	'media.auto_deleted':    'Nettoyage automatique',
};

const ACTION_COLORS: Record<AuditAction, string> = {
	'user.banned':           COLORS.danger,
	'user.active_changed':   '#0284c7',
	'user.role_changed':     '#7c3aed',
	'contestation.resolved': '#f59e0b',
	'setting.changed':       '#0ea5e9',
	'media.validated':       '#16a34a',
	'media.rejected':        COLORS.danger,
	'media.auto_deleted':    '#6b7280',
};

const FILTER_OPTIONS: { value: AuditAction | ''; label: string }[] = [
	{ value: '',                       label: 'Tout' },
	{ value: 'user.banned',            label: 'Bans' },
	{ value: 'user.active_changed',    label: 'État compte' },
	{ value: 'user.role_changed',      label: 'Rôle' },
	{ value: 'contestation.resolved',  label: 'Contestations' },
	{ value: 'setting.changed',        label: 'Paramètres' },
	{ value: 'media.validated',        label: 'Validations' },
	{ value: 'media.rejected',         label: 'Rejets' },
	{ value: 'media.auto_deleted',     label: 'Nettoyage auto' },
];

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
		default:
			return '';
	}
}

export const AdminActivityScreen: React.FC = () => {
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
					renderItem={({ item }) => (
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
						</View>
					)}
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
