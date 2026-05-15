import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { AdminService, SpeciesEditRequest, SpeciesEditSnapshot } from '@/services/api/AdminService';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

interface Props {
	items: SpeciesEditRequest[];
	onChanged: () => void;
}

function fmtTime(iso: string): string {
	try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
	catch { return iso; }
}

const FIELD_LABELS: Record<keyof SpeciesEditSnapshot, string> = {
	scientific_name:     'Nom scientifique',
	usage_name:          'Nom d\'usage',
	polynesian_name:     'Nom polynésien',
	description:         'Description',
	description_source:  'Source description',
	reference_image_url: 'Image de référence',
	tags:                'Tags',
};

const TEXT_FIELDS: (keyof SpeciesEditSnapshot)[] = [
	'scientific_name', 'usage_name', 'polynesian_name',
	'description_source', 'reference_image_url', 'description',
];

export const AdminSpeciesEditsTab: React.FC<Props> = ({ items, onChanged }) => {
	const service = useMemo(() => new AdminService(), []);
	const router = useRouter();
	const [busyId, setBusyId] = useState<number | null>(null);
	const [rejectingId, setRejectingId] = useState<number | null>(null);
	const [rejectComment, setRejectComment] = useState('');

	const resolve = async (req: SpeciesEditRequest, action: 'approve' | 'reject', comment?: string) => {
		if (busyId !== null) return;
		setBusyId(req.id);
		try {
			await service.resolveSpeciesEditRequest(req.id, action, comment);
			toast.success(action === 'approve' ? 'Modifications appliquées à la fiche.' : 'Demande rejetée.');
			setRejectingId(null);
			setRejectComment('');
			onChanged();
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Résolution impossible.');
		} finally {
			setBusyId(null);
		}
	};

	if (items.length === 0) {
		return (
			<View style={styles.empty}>
				<Text style={styles.emptyText}>Aucune demande en attente.</Text>
			</View>
		);
	}

	return (
		<ScrollView contentContainerStyle={styles.list}>
			{items.map((req) => {
				const speciesName = req.current.scientific_name || req.current.usage_name || `#${req.species_id}`;
				const isRejecting = rejectingId === req.id;
				return (
					<View key={req.id} style={styles.card}>
						<View style={styles.cardHeader}>
							<View style={{ flex: 1 }}>
								<Pressable onPress={() => router.push(`/(main)/species/${req.species_id}` as Href)}>
									<Text style={styles.speciesName}>{speciesName}</Text>
								</Pressable>
								<Text style={styles.meta}>
									Proposée par <Text style={styles.bold}>{req.proposer.username ?? `#${req.proposer.id}`}</Text> · {fmtTime(req.proposed_at)}
								</Text>
							</View>
						</View>

						<View style={styles.diffWrap}>
							<View style={styles.diffCol}>
								<Text style={styles.colTitle}>Actuel</Text>
								{TEXT_FIELDS.map((f) => (
									<DiffRow
										key={`cur-${f}`}
										label={FIELD_LABELS[f]}
										value={req.current[f] as string | null}
										changed={f in req.proposed && String(req.proposed[f] ?? '') !== String(req.current[f] ?? '')}
										side="current"
									/>
								))}
								<TagsRow label="Tags" tags={req.current.tags} proposed={req.proposed.tags} side="current" />
							</View>
							<View style={styles.diffSeparator} />
							<View style={styles.diffCol}>
								<Text style={styles.colTitle}>Proposé</Text>
								{TEXT_FIELDS.map((f) => {
									const isInPayload = f in req.proposed;
									const value = isInPayload ? (req.proposed[f] as string | null) : (req.current[f] as string | null);
									const changed = isInPayload && String(req.proposed[f] ?? '') !== String(req.current[f] ?? '');
									return (
										<DiffRow
											key={`pro-${f}`}
											label={FIELD_LABELS[f]}
											value={value}
											changed={changed}
											side="proposed"
											dimmed={!isInPayload}
										/>
									);
								})}
								<TagsRow label="Tags" tags={req.proposed.tags ?? req.current.tags} proposed={req.proposed.tags} side="proposed" current={req.current.tags} />
							</View>
						</View>

						{isRejecting ? (
							<View style={styles.rejectBlock}>
								<Text style={styles.rejectLabel}>Motif du rejet (envoyé au curator) :</Text>
								<TextInput
									value={rejectComment}
									onChangeText={setRejectComment}
									editable={busyId === null}
									multiline
									placeholder="Ex : nom scientifique invalide, tag hors-périmètre…"
									placeholderTextColor={COLORS.text.placeholder}
									style={styles.rejectInput}
								/>
								<View style={styles.actionRow}>
									<Pressable onPress={() => { setRejectingId(null); setRejectComment(''); }} disabled={busyId !== null} style={[styles.btn, styles.btnGhost]}>
										<Text style={styles.btnGhostText}>Annuler</Text>
									</Pressable>
									<Pressable
										onPress={() => resolve(req, 'reject', rejectComment.trim())}
										disabled={busyId !== null || rejectComment.trim().length === 0}
										style={[styles.btn, styles.btnReject, (busyId !== null || rejectComment.trim().length === 0) && styles.btnDisabled]}
									>
										<Text style={styles.btnRejectText}>{busyId === req.id ? 'Rejet…' : 'Confirmer le rejet'}</Text>
									</Pressable>
								</View>
							</View>
						) : (
							<View style={styles.actionRow}>
								<Pressable
									onPress={() => setRejectingId(req.id)}
									disabled={busyId !== null}
									style={[styles.btn, styles.btnGhost, busyId !== null && styles.btnDisabled]}
								>
									<Text style={styles.btnGhostText}>Rejeter</Text>
								</Pressable>
								<Pressable
									onPress={() => resolve(req, 'approve')}
									disabled={busyId !== null}
									style={[styles.btn, styles.btnApprove, busyId !== null && styles.btnDisabled]}
								>
									<Text style={styles.btnApproveText}>{busyId === req.id ? 'Application…' : 'Approuver'}</Text>
								</Pressable>
							</View>
						)}
					</View>
				);
			})}
		</ScrollView>
	);
};

const DiffRow: React.FC<{ label: string; value: string | null; changed: boolean; side: 'current' | 'proposed'; dimmed?: boolean }> = ({ label, value, changed, side, dimmed }) => (
	<View style={[
		styles.diffRow,
		changed && (side === 'proposed' ? styles.diffRowAdded : styles.diffRowRemoved),
	]}>
		<Text style={styles.fieldLabel}>{label}</Text>
		<Text style={[styles.fieldValue, dimmed && styles.fieldValueDim]} numberOfLines={3}>
			{value && value.trim().length > 0 ? value : <Text style={styles.empty2}>—</Text>}
		</Text>
	</View>
);

const TagsRow: React.FC<{ label: string; tags: string[]; proposed?: string[]; side: 'current' | 'proposed'; current?: string[] }> = ({ label, tags, proposed, side, current }) => {
	let chips: { text: string; kind: 'kept' | 'added' | 'removed' }[] = [];
	if (side === 'current') {
		const proposedSet = new Set(proposed ?? tags);
		chips = (tags ?? []).map((t) => ({ text: t, kind: proposed && !proposedSet.has(t) ? 'removed' : 'kept' }));
	} else {
		const currentSet = new Set(current ?? []);
		chips = (tags ?? []).map((t) => ({ text: t, kind: current && !currentSet.has(t) ? 'added' : 'kept' }));
	}
	return (
		<View style={styles.tagsRow}>
			<Text style={styles.fieldLabel}>{label}</Text>
			<View style={styles.tagsWrap}>
				{chips.length === 0 ? <Text style={styles.empty2}>—</Text> : null}
				{chips.map((c, i) => (
					<View key={`${c.text}-${i}`} style={[
						styles.tagChip,
						c.kind === 'added'   && styles.tagAdded,
						c.kind === 'removed' && styles.tagRemoved,
					]}>
						<Text style={[
							styles.tagText,
							c.kind === 'added'   && styles.tagAddedText,
							c.kind === 'removed' && styles.tagRemovedText,
						]}>{c.text}</Text>
					</View>
				))}
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	list: { padding: SPACING.sm, gap: SPACING.md, paddingBottom: SPACING.xl * 2 },
	empty: { padding: SPACING.xl, alignItems: 'center' },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },

	card: {
		backgroundColor: COLORS.background.card,
		borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
		padding: SPACING.md, gap: SPACING.sm,
	},
	cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
	speciesName: { ...TYPOGRAPHY.h2, color: COLORS.primary, textDecorationLine: 'underline' },
	meta:  { fontSize: 12, color: COLORS.text.secondary, marginTop: 2 },
	bold:  { fontWeight: '700', color: COLORS.text.primary },

	diffWrap:    { flexDirection: 'row', gap: 0, alignItems: 'stretch', marginTop: SPACING.xs },
	diffCol:     { flex: 1, gap: 4, paddingHorizontal: SPACING.sm },
	diffSeparator: { width: 1, backgroundColor: COLORS.border },
	colTitle:    { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },

	diffRow: { paddingVertical: 4, paddingHorizontal: 6, borderRadius: 4, gap: 1 },
	diffRowAdded:   { backgroundColor: `${COLORS.success}1A` },
	diffRowRemoved: { backgroundColor: `${COLORS.danger}11` },
	fieldLabel: { fontSize: 10, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	fieldValue: { fontSize: 13, color: COLORS.text.primary },
	fieldValueDim: { color: COLORS.text.placeholder, fontStyle: 'italic' },
	empty2: { color: COLORS.text.placeholder, fontStyle: 'italic' },

	tagsRow: { paddingVertical: 4, paddingHorizontal: 6, gap: 2 },
	tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
	tagChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	tagAdded:   { backgroundColor: `${COLORS.success}26`, borderColor: COLORS.success },
	tagRemoved: { backgroundColor: `${COLORS.danger}22`,  borderColor: COLORS.danger },
	tagText:    { fontSize: 11, color: COLORS.text.primary, fontWeight: '600' },
	tagAddedText:   { color: COLORS.success },
	tagRemovedText: { color: COLORS.danger, textDecorationLine: 'line-through' },

	actionRow: { flexDirection: 'row', gap: SPACING.sm, justifyContent: 'flex-end', marginTop: SPACING.sm },
	btn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6 },
	btnGhost: { backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	btnGhostText: { fontSize: 12, fontWeight: '600', color: COLORS.text.primary },
	btnApprove: { backgroundColor: COLORS.success },
	btnApproveText: { fontSize: 12, fontWeight: '700', color: COLORS.text.inverse },
	btnReject: { backgroundColor: COLORS.danger },
	btnRejectText: { fontSize: 12, fontWeight: '700', color: COLORS.text.inverse },
	btnDisabled: { opacity: 0.45 },

	rejectBlock: { marginTop: SPACING.sm, gap: SPACING.xs },
	rejectLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	rejectInput: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main,
		minHeight: 60, textAlignVertical: 'top',
	},
});
