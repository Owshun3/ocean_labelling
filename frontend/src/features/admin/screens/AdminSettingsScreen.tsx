import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet, Switch, Modal, Platform } from 'react-native';
import { confirm } from '@/shared/utils/dialog';
import { pickSingleFile } from '@/shared/utils/filePicker';
import { AdminService, SettingItem } from '@/services/api/AdminService';
import { refreshPublicSettings } from '@/services/api/publicSettings';
import { getRanks } from '@/shared/ranks';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

const ACCEPTED_HELP_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];
const ACCEPTED_LOGO_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
import { APP_API_BASE } from '@/services/api/runtimeUrls';

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
						{groupKey === 'ranks' ? <RankPreview drafts={drafts} /> : null}
						{groupKey === 'help' ? (
							<HelpVideoSection
								filename={String(drafts['platform.help_video_filename'] || '')}
								service={service}
								onChanged={() => { load(); refreshPublicSettings(); }}
							/>
						) : null}
						{groupKey === 'branding' ? (
							<LogoSection
								filename={String(drafts['platform.logo_filename'] || '')}
								service={service}
								onChanged={() => { load(); refreshPublicSettings(); }}
							/>
						) : null}
						<View style={styles.groupCard}>
							{groupItems
								// La vidéo d'aide et le logo ont leur propre widget — on cache
								// les champs texte par défaut qui sinon créeraient un doublon.
								.filter((it) => it.key !== 'platform.help_video_filename' && it.key !== 'platform.logo_filename')
								.map((it, idx) => (
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

const HelpVideoSection: React.FC<{ filename: string; service: AdminService; onChanged: () => void }> = ({ filename, service, onChanged }) => {
	const [uploading, setUploading] = useState(false);
	const [progress, setProgress] = useState(0);
	const [deleting, setDeleting] = useState(false);
	const hasVideo = !!filename;

	const pickAndUpload = async () => {
		const file = await pickSingleFile({ mimeTypes: ACCEPTED_HELP_VIDEO_MIMES });
		if (!file) return;
		if (!ACCEPTED_HELP_VIDEO_MIMES.includes(file.mimeType) && !/\.(mp4|webm|mov)$/i.test(file.name)) {
			toast.error('Format non supporté. Utilise MP4, WebM ou MOV.');
			return;
		}
		setUploading(true);
		setProgress(0);
		try {
			await service.uploadHelpVideo(file, setProgress);
			toast.success('Vidéo d\'aide mise à jour.');
			onChanged();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Upload impossible.');
		} finally {
			setUploading(false);
		}
	};

	const handleDelete = async () => {
		const m = 'Supprimer la vidéo d\'aide actuelle ? La page « Besoin d\'aide ? » n\'affichera plus de vidéo tant qu\'une nouvelle ne sera pas téléversée.';
		const proceed = await confirm(m, { confirmLabel: 'Supprimer', destructive: true });
		if (!proceed) return;
		setDeleting(true);
		try {
			await service.deleteHelpVideo();
			toast.success('Vidéo d\'aide supprimée.');
			onChanged();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Suppression impossible.');
		} finally {
			setDeleting(false);
		}
	};

	return (
		<View style={helpStyles.card}>
			<Text style={helpStyles.title}>Vidéo explicative — affichée sur « Besoin d'aide ? »</Text>
			{hasVideo ? (
				<>
					<View style={helpStyles.previewBox}>
						{Platform.OS === 'web' ? (
							<div style={{ width: '100%', background: '#000', borderRadius: 6, overflow: 'hidden' }}>
								{/* @ts-ignore */}
								<video
									src={`${APP_API_BASE}/help-video/stream`}
									controls
									crossOrigin="use-credentials"
									controlsList="nodownload"
									onContextMenu={(e: any) => e.preventDefault()}
									style={{ width: '100%', maxHeight: 300, display: 'block' }}
								/>
							</div>
						) : <Text style={helpStyles.muted}>Aperçu disponible sur web uniquement.</Text>}
					</View>
					<Text style={helpStyles.filename}>Fichier actuel : {filename}</Text>
				</>
			) : (
				<Text style={helpStyles.muted}>Aucune vidéo téléversée pour l'instant.</Text>
			)}
			<View style={helpStyles.actions}>
				<Pressable onPress={pickAndUpload} disabled={uploading || deleting} style={[helpStyles.btn, helpStyles.btnPrimary, (uploading || deleting) && helpStyles.btnDisabled]}>
					<Text style={helpStyles.btnPrimaryText}>
						{uploading ? `Envoi… ${progress}%` : hasVideo ? 'Remplacer la vidéo' : 'Téléverser une vidéo'}
					</Text>
				</Pressable>
				{hasVideo ? (
					<Pressable onPress={handleDelete} disabled={uploading || deleting} style={[helpStyles.btn, helpStyles.btnDanger, (uploading || deleting) && helpStyles.btnDisabled]}>
						<Text style={helpStyles.btnDangerText}>{deleting ? 'Suppression…' : 'Supprimer'}</Text>
					</Pressable>
				) : null}
			</View>
			<Text style={helpStyles.hint}>
				Formats acceptés : MP4, WebM, MOV. Taille max : 500 Mo. La vidéo est servie de façon authentifiée et le clic droit + téléchargement direct sont bloqués côté navigateur.
			</Text>
		</View>
	);
};

const LogoSection: React.FC<{ filename: string; service: AdminService; onChanged: () => void }> = ({ filename, service, onChanged }) => {
	const [uploading, setUploading] = useState(false);
	const [progress, setProgress] = useState(0);
	const [deleting, setDeleting] = useState(false);
	const hasLogo = !!filename;

	const pickAndUpload = async () => {
		const file = await pickSingleFile({ mimeTypes: ACCEPTED_LOGO_MIMES });
		if (!file) return;
		if (!ACCEPTED_LOGO_MIMES.includes(file.mimeType) && !/\.(png|jpe?g|webp|svg)$/i.test(file.name)) {
			toast.error('Format non supporté. Utilise PNG, JPEG, WebP ou SVG.');
			return;
		}
		setUploading(true);
		setProgress(0);
		try {
			await service.uploadLogo(file, setProgress);
			toast.success('Logo mis à jour.');
			onChanged();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Upload impossible.');
		} finally {
			setUploading(false);
		}
	};

	const handleDelete = async () => {
		const m = 'Supprimer le logo actuel ? Le nom de la plateforme s\'affichera seul dans le header jusqu\'à ce qu\'un nouveau logo soit téléversé.';
		const proceed = await confirm(m, { confirmLabel: 'Supprimer', destructive: true });
		if (!proceed) return;
		setDeleting(true);
		try {
			await service.deleteLogo();
			toast.success('Logo supprimé.');
			onChanged();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Suppression impossible.');
		} finally {
			setDeleting(false);
		}
	};

	return (
		<View style={helpStyles.card}>
			<Text style={helpStyles.title}>Logo — affiché dans le header à côté du nom de la plateforme</Text>
			{hasLogo ? (
				<>
					<View style={logoStyles.previewBox}>
						{Platform.OS === 'web' ? (
							/* @ts-ignore */
							<img
								src={`${APP_API_BASE}/logo/stream?v=${encodeURIComponent(filename)}`}
								style={{ width: 120, height: 120, objectFit: 'contain', background: '#fff', borderRadius: 6, padding: 8, border: '1px solid #ddd' }}
							/>
						) : <Text style={helpStyles.muted}>Aperçu disponible sur web uniquement.</Text>}
					</View>
					<Text style={helpStyles.filename}>Fichier actuel : {filename}</Text>
				</>
			) : (
				<Text style={helpStyles.muted}>Aucun logo téléversé pour l'instant.</Text>
			)}
			<View style={helpStyles.actions}>
				<Pressable onPress={pickAndUpload} disabled={uploading || deleting} style={[helpStyles.btn, helpStyles.btnPrimary, (uploading || deleting) && helpStyles.btnDisabled]}>
					<Text style={helpStyles.btnPrimaryText}>
						{uploading ? `Envoi… ${progress}%` : hasLogo ? 'Remplacer le logo' : 'Téléverser un logo'}
					</Text>
				</Pressable>
				{hasLogo ? (
					<Pressable onPress={handleDelete} disabled={uploading || deleting} style={[helpStyles.btn, helpStyles.btnDanger, (uploading || deleting) && helpStyles.btnDisabled]}>
						<Text style={helpStyles.btnDangerText}>{deleting ? 'Suppression…' : 'Supprimer'}</Text>
					</Pressable>
				) : null}
			</View>
			<Text style={helpStyles.hint}>
				Formats acceptés : PNG, JPEG, WebP, SVG. Taille max : 2 Mo. Format carré recommandé (idéalement ≥ 80×80 px).
			</Text>
		</View>
	);
};

const logoStyles = StyleSheet.create({
	previewBox: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
});

const helpStyles = StyleSheet.create({
	card: { padding: SPACING.md, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm, marginBottom: SPACING.sm },
	title: { ...TYPOGRAPHY.body, fontWeight: '700' },
	previewBox: { width: '100%' },
	filename: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic' },
	muted: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic' },
	actions: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
	btn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6 },
	btnPrimary: { backgroundColor: COLORS.primary },
	btnPrimaryText: { color: COLORS.text.inverse, fontWeight: '700' },
	btnDanger: { backgroundColor: COLORS.danger },
	btnDangerText: { color: COLORS.text.inverse, fontWeight: '700' },
	btnDisabled: { opacity: 0.5 },
	hint: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic' },
});

const RANK_IDS = ['debutant', 'bronze', 'argent', 'or', 'platine'] as const;

const RankPreview: React.FC<{ drafts: Record<string, any> }> = ({ drafts }) => {
	const baseline = getRanks();
	const previews = RANK_IDS.map((id, i) => ({
		id,
		label: typeof drafts[`rank.${id}.label`] === 'string' && drafts[`rank.${id}.label`].length > 0
			? (drafts[`rank.${id}.label`] as string)
			: baseline[i].label,
		color: typeof drafts[`rank.${id}.color`] === 'string' && /^#[0-9a-fA-F]{6}$/.test(drafts[`rank.${id}.color`] as string)
			? (drafts[`rank.${id}.color`] as string)
			: baseline[i].color,
	}));
	return (
		<View style={previewStyles.wrap}>
			<Text style={previewStyles.label}>Aperçu</Text>
			<View style={previewStyles.row}>
				{previews.map((r) => (
					<View key={r.id} style={previewStyles.chip}>
						<View style={[previewStyles.dot, { backgroundColor: r.color }]} />
						<Text style={[previewStyles.text, { color: r.color }]}>{r.label}</Text>
					</View>
				))}
			</View>
		</View>
	);
};

const previewStyles = StyleSheet.create({
	wrap: { padding: SPACING.sm, gap: 6, marginBottom: SPACING.xs },
	label: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	row:  { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
	chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 99, backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border },
	dot:  { width: 12, height: 12, borderRadius: 6 },
	text: { fontSize: 13, fontWeight: '700' },
});

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
