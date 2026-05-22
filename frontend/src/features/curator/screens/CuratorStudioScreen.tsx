import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { CuratorService, type Proposal, type ProposalSpecies } from '@/services/api/CuratorService';
import { SpeciesService, type SpeciesEditPayload } from '@/services/api/SpeciesService';
import { SpeciesTagService, type SpeciesTagGroup, validateSpeciesTags } from '@/services/api/SpeciesTagService';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';
import { toast } from '@/shared/toast/Toast';

import { useProposals } from '../hooks/useProposals';
import {
	useCuratorState,
	speciesKeyOf,
	type CuratorBbox,
	type WipCertification,
} from '../hooks/useCuratorState';
import { useSpeciesStyles } from '../hooks/useSpeciesStyles';
import { SpeciesGroupList } from '../components/SpeciesGroupList';
import { SpeciesActionsPanel } from '../components/SpeciesActionsPanel';
import { AddSpeciesWizard } from '../components/AddSpeciesWizard';
import { CuratorCanvasV2, type CuratorCanvasV2Handle } from '../components/CuratorCanvasV2';
import type { SpeciesDraftValues } from '../components/SpeciesMiniSheet';

interface Props {
	taskId: number;
	jobId: number;
}

const SPECIES_KEY_OF = (p: Proposal): string => speciesKeyOf(p.species, p.label_name);

export const CuratorStudioScreen: React.FC<Props> = ({ taskId, jobId }) => {
	const router = useRouter();
	const service = useMemo(() => new CuratorService(), []);
	const speciesService = useMemo(() => new SpeciesService(), []);
	const tagService = useMemo(() => new SpeciesTagService(), []);
	const { data, loading, error, reload } = useProposals(taskId);
	const proposals = data?.proposals ?? [];

	const speciesStyles = useSpeciesStyles();
	const state = useCuratorState(proposals);
	const canvasRef = useRef<CuratorCanvasV2Handle>(null);
	const [submitting, setSubmitting] = useState(false);

	const [tagGroups, setTagGroups] = useState<SpeciesTagGroup[]>([]);
	useEffect(() => {
		tagService.list().then(setTagGroups).catch(() => setTagGroups([]));
	}, [tagService]);

	const [speciesDrafts, setSpeciesDrafts] = useState<Map<string, SpeciesDraftValues>>(new Map());

	const draftForKey = useCallback((key: string, sp: { scientific_name: string | null; usage_name: string | null; polynesian_name: string | null; tags?: string[] } | null | undefined): SpeciesDraftValues => {
		const existing = speciesDrafts.get(key);
		if (existing) return existing;
		return {
			scientific_name: sp?.scientific_name ?? '',
			usage_name:      sp?.usage_name      ?? '',
			polynesian_name: sp?.polynesian_name ?? '',
			tags:            sp?.tags ?? [],
		};
	}, [speciesDrafts]);

	const patchDraft = useCallback((key: string, patch: Partial<SpeciesDraftValues>, baseSpecies?: { scientific_name: string | null; usage_name: string | null; polynesian_name: string | null; tags?: string[] } | null) => {
		setSpeciesDrafts((prev) => {
			const cur = prev.get(key) ?? {
				scientific_name: baseSpecies?.scientific_name ?? '',
				usage_name:      baseSpecies?.usage_name      ?? '',
				polynesian_name: baseSpecies?.polynesian_name ?? '',
				tags:            baseSpecies?.tags ?? [],
			};
			const next = new Map(prev);
			next.set(key, { ...cur, ...patch });
			return next;
		});
	}, []);

	const proposalKeys = useMemo(() => {
		const m = new Map<number, string>();
		proposals.forEach((p) => m.set(p.cvat_shape_id, SPECIES_KEY_OF(p)));
		return m;
	}, [proposals]);

	const selectedGroup = useMemo(
		() => state.allGroups.find((g) => g.speciesKey === state.selectedSpeciesKey) ?? null,
		[state.allGroups, state.selectedSpeciesKey],
	);

	const proposalsInSelectedGroup = useMemo(() => {
		if (!selectedGroup) return [];
		const ids = new Set(selectedGroup.proposalIds);
		return proposals.filter((p) => ids.has(p.cvat_shape_id));
	}, [proposals, selectedGroup]);

	const activeSpeciesKey: string | null = selectedGroup?.speciesKey ?? null;

	const checkedProposalIds = useMemo(() => {
		const s = new Set<number>();
		for (const c of state.allCertifications) {
			if (c.chosenProposalId != null) s.add(c.chosenProposalId);
		}
		return s;
	}, [state.allCertifications]);

	const onClickProposal = useCallback((p: Proposal) => {
		const key = SPECIES_KEY_OF(p);
		if (state.selectedSpeciesKey !== key) {
			state.setSelectedSpeciesKey(key);
		} else {
			state.acceptProposal(key, p);
		}
		state.setDrawingBbox(null);
	}, [state]);

	const onStartTracing = useCallback(() => {
		state.setTool('rectangle');
		state.setDrawingBbox(null);
	}, [state]);

	const onCancelTracing = useCallback(() => {
		state.setDrawingBbox(null);
	}, [state]);

	const onConfirmTracing = useCallback(() => {
		if (!state.drawingBbox || !state.selectedSpeciesKey) return;
		state.acceptOwnBbox(state.selectedSpeciesKey, state.drawingBbox);
		state.setDrawingBbox(null);
		state.setTool('select');
	}, [state]);

	const onSetDrawingBboxFromCanvas = useCallback((b: CuratorBbox | null) => {
		state.setDrawingBbox(b);
	}, [state]);

	const onPickKnownSpecies = useCallback((species: ProposalSpecies) => {
		const result = state.importExistingSpecies(species);
		if (result === 'duplicate') {
			toast.error('Cette espèce est déjà présente dans le panneau.');
			return;
		}
		state.setTool('select');
	}, [state]);

	const onCreateNewSpecies = useCallback(() => {
		state.createDraftSpecies();
		state.setTool('select');
	}, [state]);

	const certCountOf = useCallback(
		(key: string) => state.decisions.get(key)?.certifications.length ?? 0,
		[state.decisions],
	);

	const onSaveSpeciesSheet = useCallback(async (speciesId: number, payload: SpeciesEditPayload) => {
		if (speciesId > 0) {
			await speciesService.update(speciesId, payload);
			toast.success('Fiche espèce enregistrée.');
			reload();
			return;
		}
		const oldKey = selectedGroup?.speciesKey;
		if (!oldKey) return;
		const created = await speciesService.createFull({
			scientific_name: payload.scientific_name ?? '',
			usage_name:      payload.usage_name      ?? '',
			polynesian_name: payload.polynesian_name ?? '',
			tags:            payload.tags,
		});
		const proposalSpecies = {
			id: created.id,
			name: created.name,
			scientific_name: created.scientific_name ?? null,
			usage_name: created.usage_name ?? null,
			polynesian_name: created.polynesian_name ?? null,
			tags: created.tags ?? [],
			status: created.status,
		};
		const newKey = state.replaceManualSpecies(oldKey, proposalSpecies);
		setSpeciesDrafts((prev) => {
			if (!prev.has(oldKey)) return prev;
			const next = new Map(prev);
			next.delete(oldKey);
			return next;
		});
		toast.success('Espèce créée en base.');
		void newKey;
	}, [speciesService, reload, selectedGroup, state]);

	const findLocalMatch = useCallback((sci: string, excludeKey: string) => {
		const lower = sci.trim().toLowerCase();
		if (!lower) return null;
		for (const g of state.allGroups) {
			if (g.speciesKey === excludeKey) continue;
			const draft = speciesDrafts.get(g.speciesKey);
			const effective = (draft?.scientific_name?.trim() || g.species?.scientific_name || '').toLowerCase();
			if (effective && effective === lower) {
				return { speciesKey: g.speciesKey, label: draft?.scientific_name?.trim() || g.species?.scientific_name || g.species?.name || g.speciesKey };
			}
		}
		return null;
	}, [state.allGroups, speciesDrafts]);

	const onJumpToLocalSpecies = useCallback((key: string) => {
		state.setSelectedSpeciesKey(key);
		state.setDrawingBbox(null);
	}, [state]);

	const onImportInsteadOfManual = useCallback((existing: ProposalSpecies) => {
		const oldKey = selectedGroup?.speciesKey;
		if (!oldKey) return;
		state.replaceManualSpecies(oldKey, existing);
		setSpeciesDrafts((prev) => {
			if (!prev.has(oldKey)) return prev;
			const next = new Map(prev);
			next.delete(oldKey);
			return next;
		});
		toast.success(`« ${existing.scientific_name ?? existing.name} » importée à la place.`);
	}, [state, selectedGroup]);

	const effectiveValuesFor = useCallback((key: string, sp: { scientific_name: string | null; usage_name: string | null; polynesian_name: string | null; tags?: string[] } | null | undefined): SpeciesDraftValues => {
		const draft = speciesDrafts.get(key);
		if (draft) return draft;
		return {
			scientific_name: sp?.scientific_name ?? '',
			usage_name:      sp?.usage_name      ?? '',
			polynesian_name: sp?.polynesian_name ?? '',
			tags:            sp?.tags ?? [],
		};
	}, [speciesDrafts]);

	const incompleteSpeciesUsed = useMemo(() => {
		const usedKeys = new Set(state.allCertifications.map((c) => c.speciesKey));
		const bad: { key: string; label: string; reason: string }[] = [];
		for (const key of usedKeys) {
			const group = state.allGroups.find((g) => g.speciesKey === key);
			const sp = group?.species;
			if (!sp) continue;
			const v = effectiveValuesFor(key, sp);
			const namesOk = !!(v.scientific_name.trim() && v.usage_name.trim() && v.polynesian_name.trim());
			const tagsCheck = validateSpeciesTags(v.tags, tagGroups);
			if (!namesOk || !tagsCheck.ok) {
				bad.push({
					key,
					label: v.scientific_name || sp.scientific_name || sp.usage_name || sp.name || key,
					reason: !namesOk ? 'noms incomplets' : (tagsCheck.error ?? 'tags invalides'),
				});
			}
		}
		return bad;
	}, [state.allCertifications, state.allGroups, tagGroups, effectiveValuesFor]);

	const onCertifyAll = useCallback(async () => {
		if (!state.canFinalize || submitting) return;
		if (incompleteSpeciesUsed.length > 0) {
			const first = incompleteSpeciesUsed[0];
			toast.error(`« ${first.label} » : ${first.reason}. Complète la fiche dans le panneau de droite.`);
			state.setSelectedSpeciesKey(first.key);
			return;
		}
		setSubmitting(true);
		try {
			const payload = state.allCertifications.map((c) => buildPayloadCert(c, state.allGroups, proposals, speciesDrafts));
			await service.certifyAll(taskId, { cvat_job_id: jobId, certifications: payload });
			toast.success(payload.length === 0
				? 'Image marquée curator-validée (aucune espèce retenue).'
				: `${payload.length} certification${payload.length > 1 ? 's' : ''} enregistrée${payload.length > 1 ? 's' : ''}.`);
			router.replace('/(main)/curator/done' as Href);
		} catch (err: any) {
			const detail = err?.response?.data?.error ?? err?.message ?? 'Certification impossible.';
			toast.error(typeof detail === 'string' ? detail : JSON.stringify(detail));
			setSubmitting(false);
		}
	}, [state, submitting, incompleteSpeciesUsed, proposals, service, taskId, jobId, router]);

	if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	if (error || !data) return <View style={styles.center}><Text style={styles.errorText}>Erreur : {error ?? 'données indisponibles'}</Text></View>;

	return (
		<View style={styles.container}>
			<View style={styles.row}>
				<SpeciesGroupList
					proposedGroups={state.proposedGroups}
					manualGroups={state.manualGroups}
					selectedSpeciesKey={state.selectedSpeciesKey}
					statusOf={state.statusOf}
					certCountOf={certCountOf}
					draftFor={(key) => speciesDrafts.get(key)}
					onSelect={(k) => {
						if (state.wizardOpen) state.closeWizard();
						state.setSelectedSpeciesKey(k);
						state.setDrawingBbox(null);
					}}
					onAddMissing={state.openWizard}
					pendingCount={state.pendingCount}
					totalCount={state.proposedGroups.length}
				/>

				<View style={styles.canvasCol}>
					<View style={styles.toolbar}>
						<ToolButton active={state.tool === 'rectangle'} label="Rect"   onPress={() => state.setTool('rectangle')} />
						<ToolButton active={state.tool === 'select'}    label="Sélect" onPress={() => state.setTool('select')} />
						<ToolButton active={state.tool === 'pan'}       label="Pan"    onPress={() => state.setTool('pan')} />
						<View style={styles.toolDivider} />
						<ToolButton label="−"   onPress={() => canvasRef.current?.zoomOut()} compact />
						<ToolButton label="+"   onPress={() => canvasRef.current?.zoomIn()}  compact />
						<ToolButton label="0"   onPress={() => canvasRef.current?.resetZoom()} compact />
					</View>

					<View style={styles.canvasWrap}>
						<CuratorCanvasV2
							ref={canvasRef}
							jobId={jobId}
							tool={state.tool}
							proposals={proposals}
							certifications={state.allCertifications}
							proposalKeys={proposalKeys}
							selectedSpeciesKey={activeSpeciesKey}
							checkedProposalIds={checkedProposalIds}
							resolveStyle={speciesStyles.resolve}
							drawingBbox={state.drawingBbox}
							onSetDrawingBbox={onSetDrawingBboxFromCanvas}
							onClickProposal={onClickProposal}
						/>
					</View>
				</View>

				<View style={styles.actionsCol}>
					{state.wizardOpen ? (
						<AddSpeciesWizard
							onCreateNewSpecies={onCreateNewSpecies}
							onPickKnownSpecies={onPickKnownSpecies}
							onCancel={state.closeWizard}
						/>
					) : (
						<SpeciesActionsPanel
							selectedGroup={selectedGroup}
							decision={selectedGroup ? state.decisions.get(selectedGroup.speciesKey) : undefined}
							proposalsInGroup={proposalsInSelectedGroup}
							drawingBbox={state.drawingBbox}
							speciesStyle={selectedGroup ? speciesStyles.resolve(selectedGroup.speciesKey) : null}
							tagGroups={tagGroups}
							draftValues={selectedGroup?.species ? draftForKey(selectedGroup.speciesKey, selectedGroup.species) : null}
							onToggleProposal={(p) => {
								if (!selectedGroup) return;
								state.acceptProposal(selectedGroup.speciesKey, p);
							}}
							onStartTracing={onStartTracing}
							onConfirmTracing={onConfirmTracing}
							onCancelTracing={onCancelTracing}
							onRejectSpecies={() => selectedGroup && state.rejectSpecies(selectedGroup.speciesKey)}
							onResetDecision={() => selectedGroup && state.resetDecision(selectedGroup.speciesKey)}
							onRemoveCertification={(certId) => selectedGroup && state.removeCertification(selectedGroup.speciesKey, certId)}
							onSetSpeciesColor={(c) => selectedGroup && speciesStyles.set(selectedGroup.speciesKey, { color: c })}
							onSetSpeciesOpacity={(o) => selectedGroup && speciesStyles.set(selectedGroup.speciesKey, { opacity: o })}
							onSaveSpeciesSheet={onSaveSpeciesSheet}
							onSpeciesDraftChange={(patch) => selectedGroup && patchDraft(selectedGroup.speciesKey, patch, selectedGroup.species)}
							onRemoveManualSpecies={selectedGroup && selectedGroup.species && selectedGroup.species.id < 0
								? () => state.removeManualSpecies(selectedGroup.speciesKey)
								: undefined}
							onImportInsteadOfManual={onImportInsteadOfManual}
							findLocalMatch={findLocalMatch}
							onJumpToLocalSpecies={onJumpToLocalSpecies}
						/>
					)}
				</View>
			</View>

			<View style={styles.footer}>
				<View style={styles.progressRow}>
					<View style={[styles.dot, { backgroundColor: state.canFinalize ? COLORS.status.validated : COLORS.text.placeholder }]} />
					<Text style={styles.progressText}>
						{state.proposedGroups.length === 0
							? `${state.allCertifications.length} certification${state.allCertifications.length > 1 ? 's' : ''} ajoutée${state.allCertifications.length > 1 ? 's' : ''} manuellement`
							: `${state.proposedGroups.length - state.pendingCount} / ${state.proposedGroups.length} espèce${state.proposedGroups.length > 1 ? 's' : ''} traitée${(state.proposedGroups.length - state.pendingCount) > 1 ? 's' : ''}`}
						{state.allCertifications.length > 0 ? ` · ${state.allCertifications.length} cert. au total` : ''}
						{incompleteSpeciesUsed.length > 0 ? ` · ${incompleteSpeciesUsed.length} fiche${incompleteSpeciesUsed.length > 1 ? 's' : ''} à compléter` : ''}
					</Text>
				</View>
				<Pressable
					onPress={onCertifyAll}
					disabled={!state.canFinalize || submitting || incompleteSpeciesUsed.length > 0}
					style={({ hovered, pressed }: any) => [
						styles.certifyBtn,
						(!state.canFinalize || submitting || incompleteSpeciesUsed.length > 0) && styles.btnDisabled,
						(hovered || pressed) && state.canFinalize && !submitting && incompleteSpeciesUsed.length === 0 && styles.btnActive,
					]}
				>
					<Text style={styles.certifyBtnText}>
						{submitting ? 'Envoi…'
							: incompleteSpeciesUsed.length > 0 ? `Compléter ${incompleteSpeciesUsed.length} fiche${incompleteSpeciesUsed.length > 1 ? 's' : ''}`
							: 'Certifier tout'}
					</Text>
				</Pressable>
			</View>
		</View>
	);
};

function buildPayloadCert(
	wip: WipCertification,
	allGroups: ReturnType<typeof useCuratorState>['allGroups'],
	proposals: Proposal[],
	drafts: Map<string, SpeciesDraftValues>,
): import('@/services/api/CuratorService').CertifyAllPayload['certifications'][number] {
	const group = allGroups.find((g) => g.speciesKey === wip.speciesKey);
	const sp = group?.species;
	const draft = drafts.get(wip.speciesKey);
	const proposal = wip.chosenProposalId != null
		? proposals.find((p) => p.cvat_shape_id === wip.chosenProposalId)
		: null;
	return {
		mode: wip.mode,
		shape: {
			points: [wip.shape.x, wip.shape.y, wip.shape.x + wip.shape.width, wip.shape.y + wip.shape.height],
		},
		species: {
			scientific_name: (draft?.scientific_name ?? sp?.scientific_name ?? '').trim(),
			usage_name:      (draft?.usage_name      ?? sp?.usage_name      ?? '').trim(),
			polynesian_name: (draft?.polynesian_name ?? sp?.polynesian_name ?? '').trim(),
			tags:            draft?.tags ?? sp?.tags ?? [],
			source_name:     sp?.name,
		},
		chosen_bbox_annotator_id: proposal?.annotator_id ?? null,
		comment: wip.comment,
	};
}

const ToolButton: React.FC<{ label: string; active?: boolean; onPress: () => void; compact?: boolean }> = ({
	label, active, onPress, compact,
}) => (
	<Pressable
		onPress={onPress}
		style={[styles.toolBtn, compact && styles.toolBtnCompact, active && styles.toolBtnActive]}
	>
		<Text style={[styles.toolBtnText, active && styles.toolBtnTextActive]}>{label}</Text>
	</Pressable>
);

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.md, backgroundColor: COLORS.background.main, gap: SPACING.sm },
	row: { flex: 1, flexDirection: 'row', gap: SPACING.md, minHeight: 0 },

	canvasCol: { flex: 1, gap: SPACING.sm },
	toolbar: {
		flexDirection: 'row', alignItems: 'center', gap: 6,
		backgroundColor: COLORS.background.card,
		borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
		padding: SPACING.sm,
	},
	toolDivider: { width: 1, alignSelf: 'stretch', backgroundColor: COLORS.border, marginHorizontal: 4 },
	toolBtn: {
		minWidth: 60, paddingVertical: 6, paddingHorizontal: SPACING.sm,
		borderRadius: 6, borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
		alignItems: 'center',
	},
	toolBtnCompact: { minWidth: 36 },
	toolBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
	toolBtnText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },
	toolBtnTextActive: { color: COLORS.text.inverse },

	canvasWrap: { flex: 1, backgroundColor: COLORS.background.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },

	actionsCol: { width: 320 },

	footer: {
		flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
		backgroundColor: COLORS.background.card,
		borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
		padding: SPACING.md,
	},
	progressRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
	dot: { width: 10, height: 10, borderRadius: 5 },
	progressText: { fontSize: 13, color: COLORS.text.primary, fontWeight: '600', flex: 1 },

	certifyBtn: {
		paddingVertical: 12, paddingHorizontal: SPACING.xl,
		borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center', minWidth: 180,
	},
	certifyBtnText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },
	btnDisabled: { opacity: 0.4 },
	btnActive: { opacity: 0.85 },

	center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
	errorText: { ...TYPOGRAPHY.body, color: COLORS.danger },
});
