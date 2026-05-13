import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet, Switch, Modal } from 'react-native';
import { AdminService, SettingItem } from '@/services/api/AdminService';
import { refreshPublicSettings } from '@/services/api/publicSettings';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

const MAINTENANCE_KEY = 'platform.maintenance_mode';

// Some int settings are stored in a fine-grained unit but presented in a coarser one for ergonomics.
const DISPLAY_UNITS: Record<string, { toDisplay: (raw: number) => number; toRaw: (display: number) => number }> = {
	upload_max_bytes: {
		toDisplay: (bytes) => Math.round(bytes / (1024 * 1024)),
		toRaw:     (mb)    => mb * 1024 * 1024,
	},
};

export const AdminSettingsScreen: React.FC = () => {
	const service = useMemo(() => new AdminService(), []);
	const [items, setItems] = useState<SettingItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [drafts, setDrafts] = useState<Record<string, string | number | boolean>>({});
	const [saving, setSaving] = useState<Record<string, boolean>>({});
	const [confirmMaintenance, setConfirmMaintenance] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const resp = await service.listSettings();
			setItems(resp.items);
			const d: Record<string, any> = {};
			resp.items.forEach((it) => {
				const unit = DISPLAY_UNITS[it.key];
				d[it.key] = unit && typeof it.value === 'number' ? unit.toDisplay(it.value) : it.value;
			});
			setDrafts(d);
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Chargement impossible.');
		} finally {
			setLoading(false);
		}
	}, [service]);

	useEffect(() => { load(); }, [load]);

	const grouped = useMemo(() => {
		const map = new Map<string, { label: string; items: SettingItem[] }>();
		items.forEach((it) => {
			const entry = map.get(it.group_name) ?? { label: it.group_label, items: [] };
			entry.items.push(it);
			map.set(it.group_name, entry);
		});
		return Array.from(map.entries());
	}, [items]);

	const isDirty = (it: SettingItem): boolean => {
		const unit = DISPLAY_UNITS[it.key];
		const stored = unit && typeof it.value === 'number' ? unit.toDisplay(it.value) : it.value;
		return String(drafts[it.key] ?? '') !== String(stored ?? '');
	};

	const setDraft = (key: string, value: any) => {
		setDrafts((prev) => ({ ...prev, [key]: value }));
	};

	const saveSetting = async (it: SettingItem) => {
		const draft = drafts[it.key];
		const unit = DISPLAY_UNITS[it.key];
		let value: string | number | boolean = draft as any;
		if (unit) {
			const n = Number(draft);
			if (!Number.isFinite(n)) {
				toast.error('Valeur invalide.');
				return;
			}
			value = unit.toRaw(n);
		}
		setSaving((prev) => ({ ...prev, [it.key]: true }));
		try {
			await service.updateSetting(it.key, value);
			toast.success(`Paramètre « ${it.label} » mis à jour.`);
			await load();
			if (it.is_public) void refreshPublicSettings();
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Mise à jour impossible.');
		} finally {
			setSaving((prev) => ({ ...prev, [it.key]: false }));
		}
	};

	const handleMaintenanceToggle = (it: SettingItem, next: boolean) => {
		if (next === true) {
			// turning ON → ask confirmation
			setDraft(it.key, true);
			setConfirmMaintenance(true);
		} else {
			// turning OFF → save immediately
			setDraft(it.key, false);
			void service.updateSetting(it.key, false)
				.then(() => { toast.success('Mode maintenance désactivé.'); load(); refreshPublicSettings(); })
				.catch((err) => toast.error(err?.response?.data?.error ?? err?.message ?? 'Mise à jour impossible.'));
		}
	};

	const confirmActivateMaintenance = async () => {
		const it = items.find((i) => i.key === MAINTENANCE_KEY);
		if (!it) return;
		setConfirmMaintenance(false);
		try {
			await service.updateSetting(MAINTENANCE_KEY, true);
			toast.success('Mode maintenance activé.');
			await load();
			void refreshPublicSettings();
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Mise à jour impossible.');
			setDraft(MAINTENANCE_KEY, false);
		}
	};

	const cancelActivateMaintenance = () => {
		setConfirmMaintenance(false);
		setDraft(MAINTENANCE_KEY, false);
	};

	if (loading) {
		return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	}

	return (
		<>
			<ScrollView style={styles.container} contentContainerStyle={styles.content}>
				<Text style={styles.title}>Paramètres système</Text>
				<Text style={styles.subtitle}>
					{items.length} paramètre(s) — modifications appliquées immédiatement.
				</Text>

				{grouped.map(([groupKey, { label, items: groupItems }]) => (
					<View key={groupKey} style={styles.group}>
						<Text style={styles.groupLabel}>{label}</Text>
						<View style={styles.groupCard}>
							{groupItems.map((it, idx) => (
								<View key={it.key} style={[styles.row, idx > 0 && styles.rowBordered]}>
									<View style={styles.rowText}>
										<Text style={styles.itemLabel}>{it.label}</Text>
										{it.description ? <Text style={styles.itemDescription}>{it.description}</Text> : null}
									</View>

									<View style={styles.rowControl}>
										{it.type === 'bool' ? (
											<Switch
												value={Boolean(drafts[it.key])}
												disabled={!!saving[it.key]}
												onValueChange={(next) => {
													if (it.key === MAINTENANCE_KEY) handleMaintenanceToggle(it, next);
													else {
														setDraft(it.key, next);
														void service.updateSetting(it.key, next)
															.then(() => {
																toast.success(`Paramètre « ${it.label} » mis à jour.`);
																load();
																if (it.is_public) refreshPublicSettings();
															})
															.catch((err) => toast.error(err?.response?.data?.error ?? err?.message ?? 'Mise à jour impossible.'));
													}
												}}
												trackColor={{ true: COLORS.primary, false: COLORS.border }}
											/>
										) : (
											<>
												<TextInput
													value={String(drafts[it.key] ?? '')}
													onChangeText={(t) => setDraft(it.key, it.type === 'int' ? t.replace(/[^0-9]/g, '') : t)}
													editable={!saving[it.key]}
													keyboardType={it.type === 'int' ? 'numeric' : 'default'}
													multiline={it.type === 'string' && (it.key.includes('message') || it.key.includes('welcome'))}
													style={[
														styles.input,
														it.type === 'string' && (it.key.includes('message') || it.key.includes('welcome')) && styles.inputMultiline,
													]}
												/>
												<Pressable
													onPress={() => saveSetting(it)}
													disabled={!isDirty(it) || !!saving[it.key]}
													style={[styles.saveBtn, (!isDirty(it) || saving[it.key]) && styles.saveBtnDisabled]}
												>
													<Text style={styles.saveBtnText}>{saving[it.key] ? '…' : 'Enregistrer'}</Text>
												</Pressable>
											</>
										)}
									</View>
								</View>
							))}
						</View>
					</View>
				))}
			</ScrollView>

			<Modal visible={confirmMaintenance} transparent animationType="fade" onRequestClose={cancelActivateMaintenance}>
				<View style={styles.backdrop}>
					<View style={styles.modal}>
						<Text style={styles.modalTitle}>Activer le mode maintenance ?</Text>
						<Text style={styles.modalBody}>
							La plateforme sera <Text style={{ fontWeight: '700' }}>immédiatement indisponible</Text> pour tous les utilisateurs non-administrateurs (page de maintenance affichée à la place).
							Tu pourras la réactiver à tout moment depuis cette page.
						</Text>
						<View style={styles.modalActions}>
							<Pressable onPress={cancelActivateMaintenance} style={[styles.modalBtn, styles.modalCancel]}>
								<Text style={styles.modalCancelText}>Annuler</Text>
							</Pressable>
							<Pressable onPress={confirmActivateMaintenance} style={[styles.modalBtn, styles.modalConfirm]}>
								<Text style={styles.modalConfirmText}>Activer la maintenance</Text>
							</Pressable>
						</View>
					</View>
				</View>
			</Modal>
		</>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

	title: { ...TYPOGRAPHY.h1 },
	subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginBottom: SPACING.lg },

	group: { marginBottom: SPACING.lg },
	groupLabel: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginBottom: SPACING.xs },
	groupCard: { backgroundColor: COLORS.background.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },

	row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, padding: SPACING.md },
	rowBordered: { borderTopWidth: 1, borderTopColor: COLORS.border },
	rowText: { flex: 1 },
	rowControl: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minWidth: 280 },

	itemLabel: { fontSize: 14, color: COLORS.text.primary, fontWeight: '600' },
	itemDescription: { fontSize: 12, color: COLORS.text.secondary, fontStyle: 'italic', marginTop: 2 },

	input: {
		flex: 1,
		minWidth: 160,
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main,
	},
	inputMultiline: { minHeight: 60, textAlignVertical: 'top' },

	saveBtn: {
		paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
		borderRadius: 6, backgroundColor: COLORS.primary,
		alignItems: 'center', justifyContent: 'center',
	},
	saveBtnDisabled: { opacity: 0.4 },
	saveBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 12 },

	backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
	modal: { backgroundColor: COLORS.background.card, borderRadius: 10, padding: SPACING.lg, maxWidth: 480, width: '100%', gap: SPACING.md },
	modalTitle: { ...TYPOGRAPHY.h2, fontSize: 16, color: COLORS.text.primary },
	modalBody: { ...TYPOGRAPHY.body, color: COLORS.text.primary, lineHeight: 20 },
	modalActions: { flexDirection: 'row', gap: SPACING.sm, justifyContent: 'flex-end', marginTop: SPACING.sm },
	modalBtn: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: 6 },
	modalCancel: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background.main },
	modalCancelText: { color: COLORS.text.primary, fontWeight: '600', fontSize: 13 },
	modalConfirm: { backgroundColor: COLORS.danger },
	modalConfirmText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 13 },
});
