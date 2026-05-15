import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet, TextInput, Modal } from 'react-native';
import { AdminService, CurationPoolItem, CurationCandidate, AutoAssignResponse } from '@/services/api/AdminService';
import { appApiClient } from '@/services/api/AppApiService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { RankBadge } from '@/shared/components/RankBadge';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

function fmtDate(s: string): string {
	try { return new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
	catch { return s; }
}

export const AdminCurationAssignmentScreen: React.FC = () => {
	const service = useMemo(() => new AdminService(), []);
	const [pool, setPool]           = useState<CurationPoolItem[]>([]);
	const [curators, setCurators]   = useState<CurationCandidate[]>([]);
	const [loading, setLoading]     = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [selected, setSelected]   = useState<Set<number>>(new Set());
	const [lastClicked, setLastClicked] = useState<number | null>(null);
	const [query, setQuery]         = useState('');
	const [pickedCurator, setPickedCurator] = useState<CurationCandidate | null>(null);
	const [dropdownOpen, setDropdownOpen]   = useState(false);
	const [autoPreview, setAutoPreview] = useState<AutoAssignResponse | null>(null);
	const [autoLoading, setAutoLoading] = useState(false);
	const [autoApplying, setAutoApplying] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const inputRef = useRef<TextInput>(null);
	const orderedIdsRef = useRef<number[]>([]);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [p, c] = await Promise.all([service.listCurationPool(), service.listCurators()]);
			setPool(p);
			setCurators(c);
			setSelected(new Set());
			setLastClicked(null);
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Chargement impossible.');
		} finally {
			setLoading(false);
		}
	}, [service]);

	useEffect(() => { load(); }, [load]);

	useEffect(() => {
		orderedIdsRef.current = pool.map((p) => p.cvat_task_id);
	}, [pool]);

	const filteredCurators = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return curators;
		return curators.filter((c) => c.username.toLowerCase().includes(q));
	}, [curators, query]);

	const handleTileClick = (taskId: number, evt: any) => {
		const native = evt?.nativeEvent || {};
		const shift = !!native.shiftKey;
		const ctrlOrMeta = !!native.ctrlKey || !!native.metaKey;

		if (shift && lastClicked !== null) {
			const ids = orderedIdsRef.current;
			const a = ids.indexOf(lastClicked);
			const b = ids.indexOf(taskId);
			if (a >= 0 && b >= 0) {
				const [start, end] = a < b ? [a, b] : [b, a];
				setSelected(new Set(ids.slice(start, end + 1)));
			}
			return;
		}
		if (ctrlOrMeta) {
			setSelected((prev) => {
				const next = new Set(prev);
				if (next.has(taskId)) next.delete(taskId);
				else next.add(taskId);
				return next;
			});
			setLastClicked(taskId);
			return;
		}
		setSelected(new Set([taskId]));
		setLastClicked(taskId);
	};

	const pickCurator = (c: CurationCandidate) => {
		setPickedCurator(c);
		setQuery(c.username);
		setDropdownOpen(false);
	};

	const clearCurator = () => {
		setPickedCurator(null);
		setQuery('');
	};

	const openAutoPreview = async () => {
		if (autoLoading || pool.length === 0) return;
		setAutoLoading(true);
		try {
			const preview = await service.autoAssignCuration(true);
			setAutoPreview(preview);
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Prévisualisation impossible.');
		} finally {
			setAutoLoading(false);
		}
	};

	const applyAutoAssign = async () => {
		if (autoApplying || !autoPreview) return;
		setAutoApplying(true);
		try {
			const result = await service.autoAssignCuration(false);
			toast.success(`${result.assigned ?? 0} média(s) répartis sur ${result.curators_used} curator(s).`);
			setAutoPreview(null);
			await load();
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Attribution impossible.');
		} finally {
			setAutoApplying(false);
		}
	};

	const submit = async () => {
		if (selected.size === 0 || !pickedCurator || submitting) return;
		setSubmitting(true);
		try {
			const result = await service.assignCuration(Array.from(selected), pickedCurator.id);
			if (result.assigned === 0) {
				toast.info('Aucun média n\'a pu être attribué — peut-être déjà attribué entre-temps.');
			} else if (result.assigned < result.requested) {
				toast.info(`${result.assigned}/${result.requested} média(s) attribué(s) à ${pickedCurator.username}.`);
			} else {
				toast.success(`${result.assigned} média(s) attribué(s) à ${pickedCurator.username}.`);
			}
			clearCurator();
			await load();
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Attribution impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	}

	const selectionEmpty = selected.size === 0;
	const canSubmit = !selectionEmpty && !!pickedCurator && !submitting;

	return (
		<View style={styles.container}>
			<View style={styles.headerRow}>
				<View style={{ flex: 1 }}>
					<Text style={styles.title}>Attribution des curations</Text>
					<Text style={styles.subtitle}>
						{pool.length} média(s) en attente d'attribution · {selected.size} sélectionné(s)
					</Text>
				</View>
				<Pressable
					onPress={openAutoPreview}
					disabled={autoLoading || pool.length === 0}
					style={[styles.autoBtn, (autoLoading || pool.length === 0) && styles.btnDisabled]}
				>
					<Text style={styles.autoBtnText}>{autoLoading ? 'Calcul…' : 'Attribuer automatiquement'}</Text>
				</Pressable>
				<Pressable
					onPress={async () => {
						if (refreshing) return;
						setRefreshing(true);
						try {
							const r = await service.refreshCurationCounts();
							toast.success(`Compteurs synchronisés (${r.refreshed} média(s) revérifiés).`);
							await load();
						} catch (err: any) {
							toast.error(err?.response?.data?.error ?? err?.message ?? 'Refresh impossible.');
						} finally {
							setRefreshing(false);
						}
					}}
					disabled={refreshing}
					style={[styles.refreshBtn, refreshing && styles.btnDisabled]}
				>
					<Text style={styles.refreshBtnText}>{refreshing ? '↻ Synchro…' : '↻ Resynchroniser'}</Text>
				</Pressable>
			</View>

			<View style={styles.row}>
				<View style={styles.leftColumn}>
					<View style={styles.card}>
						<Text style={styles.cardTitle}>Sélection</Text>
						<Text style={styles.legend}>Clic → un seul</Text>
						<Text style={styles.legend}>Maj + clic → plage</Text>
						<Text style={styles.legend}>Ctrl/Cmd + clic → ajouter/retirer</Text>
					</View>

					<View style={styles.card}>
						<Text style={styles.cardTitle}>Tri</Text>
						<Text style={styles.legend}>Aujourd'hui : par date de validation modération (asc).</Text>
						<Text style={styles.legend}>À venir : par uploadeur, par rang annotateur, par tag d'espèce, par date d'upload.</Text>
					</View>

					<View style={styles.card}>
						<Text style={styles.cardTitle}>Notes</Text>
						<Text style={styles.legend}>Un média attribué disparaît immédiatement de cette file. La réassignation se fera depuis une page séparée (TODO).</Text>
						<Text style={styles.legend}>Si la certification est ensuite contestée et acceptée par l'admin, le média revient ici, sans attribution.</Text>
					</View>
				</View>

				<ScrollView style={styles.centerColumn} contentContainerStyle={styles.centerContent}>
					{pool.length === 0 ? (
						<View style={styles.empty}><Text style={styles.emptyText}>Aucun média en attente d'attribution.</Text></View>
					) : (
						<View style={styles.tiles}>
							{pool.map((item) => {
								const isSelected = selected.has(item.cvat_task_id);
								return (
									<Pressable
										key={item.cvat_task_id}
										onPress={(e) => handleTileClick(item.cvat_task_id, e)}
										style={[styles.tile, isSelected && styles.tileSelected]}
									>
										<AuthenticatedImage
											url={`/moderation/media/${item.cvat_task_id}/preview`}
											style={styles.tileImage}
											client={appApiClient}
										/>
										<View style={styles.tileFooter}>
											<Text style={styles.tileName} numberOfLines={1}>{item.task_name}</Text>
											<Text style={styles.tileMeta}>
												par {item.uploader.username ?? `#${item.uploader.id}`} · {fmtDate(item.reviewed_at)}
											</Text>
										</View>
									</Pressable>
								);
							})}
						</View>
					)}
				</ScrollView>

				<View style={styles.rightColumn}>
					<View style={styles.card}>
						<Text style={styles.cardTitle}>Attribuer à</Text>
						<View style={styles.curatorInputWrap}>
							<TextInput
								ref={inputRef}
								value={query}
								onChangeText={(t) => { setQuery(t); setPickedCurator(null); setDropdownOpen(true); }}
								onFocus={() => setDropdownOpen(true)}
								editable={!submitting}
								placeholder="Tape un nom ou clique pour voir tous les curators"
								placeholderTextColor={COLORS.text.placeholder}
								autoCapitalize="none"
								style={styles.input}
							/>
							{pickedCurator ? (
								<Pressable onPress={clearCurator} style={styles.clearBtn}>
									<Text style={styles.clearBtnText}>×</Text>
								</Pressable>
							) : null}
						</View>

						{dropdownOpen && filteredCurators.length > 0 ? (
							<ScrollView style={styles.dropdown} keyboardShouldPersistTaps="handled">
								{filteredCurators.map((c) => (
									<Pressable
										key={c.id}
										onPress={() => pickCurator(c)}
										style={({ hovered }: any) => [styles.dropdownRow, hovered && styles.dropdownRowHover]}
									>
										<View style={{ flex: 1 }}>
											<Text style={styles.candName}>{c.username}</Text>
											<View style={styles.candMeta}>
												<Text style={styles.candRole}>{c.role}</Text>
												<RankBadge actions={c.actions_validated_total} size="sm" />
												<Text style={styles.candLoad}>· {c.pending_assignments} en attente</Text>
											</View>
										</View>
									</Pressable>
								))}
							</ScrollView>
						) : dropdownOpen && filteredCurators.length === 0 ? (
							<Text style={styles.noMatch}>Aucun curator correspondant.</Text>
						) : null}

						{pickedCurator ? (
							<View style={styles.pickedBlock}>
								<Text style={styles.pickedLabel}>Sélectionné :</Text>
								<View style={styles.pickedRow}>
									<Text style={styles.pickedName}>{pickedCurator.username}</Text>
									<RankBadge actions={pickedCurator.actions_validated_total} size="sm" />
								</View>
								<Text style={styles.pickedHint}>{pickedCurator.pending_assignments} média(s) déjà dans sa file.</Text>
							</View>
						) : null}

						<Pressable
							onPress={submit}
							disabled={!canSubmit}
							style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
						>
							<Text style={styles.submitBtnText}>
								{submitting ? 'Attribution…' : `Attribuer ${selected.size > 0 ? `(${selected.size})` : ''}`}
							</Text>
						</Pressable>
					</View>
				</View>
			</View>

			<Modal
				visible={autoPreview !== null}
				transparent
				animationType="fade"
				onRequestClose={() => !autoApplying && setAutoPreview(null)}
			>
				<View style={styles.modalOverlay}>
					<View style={styles.modalCard}>
						<Text style={styles.modalTitle}>Prévisualisation de l'attribution</Text>
						{autoPreview ? (
							<>
								<Text style={styles.modalSubtitle}>
									{autoPreview.curators_used < autoPreview.curators_count
										? `${autoPreview.pool_size} média(s) répartis sur ${autoPreview.curators_used} curator(s) tirés parmi ${autoPreview.curators_count} (admins exclus). Pool insuffisant pour servir tout le monde — un autre tirage en désignera d'autres.`
										: `${autoPreview.pool_size} média(s) répartis sur ${autoPreview.curators_count} curator(s) (admins exclus).`}
								</Text>
								<ScrollView style={styles.planList} contentContainerStyle={{ paddingVertical: SPACING.sm }}>
									{autoPreview.plan.map((slot) => (
										<View key={slot.curator_id} style={styles.planRow}>
											<Text style={styles.planName}>{slot.curator_username}</Text>
											<Text style={styles.planCount}>{slot.count} média(s)</Text>
										</View>
									))}
								</ScrollView>
								<Text style={styles.modalHint}>
									La distribution est aléatoire à chaque exécution. Lance à nouveau pour permuter les tirages.
								</Text>
								<View style={styles.modalActions}>
									<Pressable
										onPress={() => !autoApplying && setAutoPreview(null)}
										disabled={autoApplying}
										style={[styles.modalBtnSecondary, autoApplying && styles.btnDisabled]}
									>
										<Text style={styles.modalBtnSecondaryText}>Annuler</Text>
									</Pressable>
									<Pressable
										onPress={openAutoPreview}
										disabled={autoApplying || autoLoading}
										style={[styles.modalBtnSecondary, (autoApplying || autoLoading) && styles.btnDisabled]}
									>
										<Text style={styles.modalBtnSecondaryText}>{autoLoading ? 'Calcul…' : 'Mélanger à nouveau'}</Text>
									</Pressable>
									<Pressable
										onPress={applyAutoAssign}
										disabled={autoApplying}
										style={[styles.modalBtnPrimary, autoApplying && styles.btnDisabled]}
									>
										<Text style={styles.modalBtnPrimaryText}>{autoApplying ? 'Attribution…' : 'Confirmer'}</Text>
									</Pressable>
								</View>
							</>
						) : null}
					</View>
				</View>
			</Modal>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg, gap: SPACING.sm },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

	headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
	refreshBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border },
	refreshBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.text.primary },
	autoBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, backgroundColor: COLORS.primary },
	autoBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.text.inverse },
	btnDisabled: { opacity: 0.4 },

	modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
	modalCard: { width: '100%', maxWidth: 520, backgroundColor: COLORS.background.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, gap: SPACING.sm },
	modalTitle: { ...TYPOGRAPHY.h2, color: COLORS.text.primary },
	modalSubtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },
	planList: { maxHeight: 320, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, backgroundColor: COLORS.background.main, marginTop: SPACING.sm },
	planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
	planName: { fontSize: 13, color: COLORS.text.primary, fontWeight: '600' },
	planCount: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
	modalHint: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },
	modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm, marginTop: SPACING.sm },
	modalBtnSecondary: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background.main },
	modalBtnSecondaryText: { fontSize: 13, fontWeight: '600', color: COLORS.text.primary },
	modalBtnPrimary: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, backgroundColor: COLORS.primary },
	modalBtnPrimaryText: { fontSize: 13, fontWeight: '700', color: COLORS.text.inverse },
	title: { ...TYPOGRAPHY.h1 },
	subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },

	row: { flex: 1, flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
	leftColumn: { width: 240, gap: SPACING.sm },
	centerColumn: { flex: 1 },
	centerContent: { gap: SPACING.md, paddingBottom: SPACING.lg },
	rightColumn: { width: 300, gap: SPACING.sm },

	card: { backgroundColor: COLORS.background.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: 4 },
	cardTitle: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
	legend: { fontSize: 12, color: COLORS.text.primary, lineHeight: 17 },

	empty: { padding: SPACING.xl, alignItems: 'center' },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },

	tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
	tile: { width: 180, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', backgroundColor: COLORS.background.main },
	tileSelected: { borderColor: COLORS.primary, borderWidth: 2 },
	tileImage: { width: '100%', height: 120 },
	tileFooter: { padding: SPACING.sm, gap: 2 },
	tileName: { fontSize: 12, fontWeight: '700', color: COLORS.text.primary },
	tileMeta: { fontSize: 11, color: COLORS.text.secondary },

	curatorInputWrap: { flexDirection: 'row', alignItems: 'center' },
	input: {
		flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main,
	},
	clearBtn: { position: 'absolute', right: 8, padding: 4 },
	clearBtnText: { fontSize: 16, color: COLORS.text.secondary, fontWeight: '700' },

	dropdown: {
		marginTop: 4, maxHeight: 240,
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		backgroundColor: COLORS.background.main,
	},
	dropdownRow: { padding: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
	dropdownRowHover: { backgroundColor: COLORS.background.card },
	candName: { fontSize: 13, fontWeight: '600', color: COLORS.text.primary },
	candMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
	candRole: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
	candLoad: { fontSize: 11, color: COLORS.text.secondary },
	noMatch: { fontSize: 12, color: COLORS.text.placeholder, fontStyle: 'italic', marginTop: 4 },

	pickedBlock: { marginTop: SPACING.sm, padding: SPACING.sm, borderRadius: 6, backgroundColor: COLORS.background.main, gap: 4 },
	pickedLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	pickedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
	pickedName: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
	pickedHint: { fontSize: 11, color: COLORS.text.secondary },

	submitBtn: { marginTop: SPACING.sm, paddingVertical: SPACING.sm, borderRadius: 6, backgroundColor: COLORS.primary, alignItems: 'center' },
	submitBtnDisabled: { opacity: 0.4 },
	submitBtnText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 13 },
});
