import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { toast } from '@/shared/toast/Toast';
import { useRouter, Href } from 'expo-router';
import { CuratorService, Proposal } from '@/services/api/CuratorService';
import { StudioTool } from '@/features/studio/types';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';
import { useProposals } from '../hooks/useProposals';
import { useCuratorMode, CuratorBbox } from '../hooks/useCuratorMode';
import { loadCuratorAnnotatorColor, saveCuratorAnnotatorColor } from '../utils/annotatorColors';
import { CuratorCanvas, CuratorCanvasHandle, HoveredProposal } from '../components/CuratorCanvas';
import { CuratorSidebarLeft } from '../components/CuratorSidebarLeft';
import { CuratorSidebarRight } from '../components/CuratorSidebarRight';
import { BboxTooltip } from '../components/BboxTooltip';
import { SpeciesTriValue } from '../components/SpeciesTriFieldForm';
import { buildSpeciesOptions, SpeciesOption } from '../components/SpeciesProposalList';

interface Props {
	taskId: number;
	jobId: number;
}

const EMPTY_SPECIES: SpeciesTriValue = { scientific_name: '', usage_name: '', polynesian_name: '' };

export const CuratorStudioScreen: React.FC<Props> = ({ taskId, jobId }) => {
	const router = useRouter();
	const service = useMemo(() => new CuratorService(), []);
	const initialColor = useMemo(() => loadCuratorAnnotatorColor(), []);
	const state = useCuratorMode(initialColor);
	const { data, loading, error } = useProposals(taskId);
	const canvasRef = useRef<CuratorCanvasHandle>(null);

	const [tool, setTool] = useState<StudioTool>('rectangle');
	const [hovered, setHovered] = useState<HoveredProposal | null>(null);
	const [species, setSpecies] = useState<SpeciesTriValue>(EMPTY_SPECIES);
	const [comment, setComment] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [selectedSpeciesKey, setSelectedSpeciesKey] = useState<string | null>(null);

	useEffect(() => { saveCuratorAnnotatorColor(state.annotatorColor); }, [state.annotatorColor]);

	const proposals = data?.proposals ?? [];
	const selectedProposal: Proposal | null = useMemo(() => {
		if (state.mode !== 'review') return null;
		if (state.selectedIds.size !== 1) return null;
		const onlyId = state.selectedIds.values().next().value;
		return proposals.find((p) => p.cvat_shape_id === onlyId) ?? null;
	}, [state.mode, state.selectedIds, proposals]);

	const speciesOptions = useMemo(() => buildSpeciesOptions(proposals), [proposals]);

	const selectedSpeciesOpt: SpeciesOption | null = useMemo(
		() => speciesOptions.find((o) => o.key === selectedSpeciesKey) ?? null,
		[speciesOptions, selectedSpeciesKey],
	);

	useEffect(() => {
		if (state.mode === 'drawing') return;
		if (selectedSpeciesKey !== null) return;
		if (state.selectedIds.size !== 1) return;
		const onlyId = state.selectedIds.values().next().value;
		const p = proposals.find((q) => q.cvat_shape_id === onlyId);
		if (!p) return;
		const key = p.species ? `id:${p.species.id}` : `name:${p.label_name ?? ''}`;
		setSelectedSpeciesKey(key);
	}, [state.mode, state.selectedIds, proposals, selectedSpeciesKey]);

	// Saisie autorisée uniquement quand on est en train de tracer (Nouvelle annotation)
	// OU quand la proposition sélectionnée est non-validée (NV) — autrement dit, pas
	// d'édition possible quand rien n'est sélectionné ou quand une espèce approuvée
	// est sélectionnée (sa fiche fait foi).
	const isApprovedSelected = selectedSpeciesOpt?.species?.status === 'approved';
	const isPendingSelected  = selectedSpeciesOpt
		&& (!selectedSpeciesOpt.species || selectedSpeciesOpt.species.status === 'pending');
	const canTypeSpecies = state.mode === 'drawing' || !!isPendingSelected;

	// Pilote le contenu des 3 champs en fonction de l'état :
	//   - drawing / rien sélectionné : vide
	//   - sélection approuvée : pré-rempli (non éditable, sert à montrer la fiche)
	//   - sélection NV : pré-rempli (éditable, le curator peut ajuster)
	useEffect(() => {
		if (state.mode === 'drawing' || !selectedSpeciesOpt) {
			setSpecies(EMPTY_SPECIES);
			return;
		}
		const sp = selectedSpeciesOpt.species;
		if (!sp) {
			setSpecies({
				scientific_name: '',
				usage_name:      selectedSpeciesOpt.fallbackLabel ?? selectedSpeciesOpt.displayName,
				polynesian_name: '',
			});
			return;
		}
		setSpecies({
			scientific_name: sp.scientific_name ?? '',
			usage_name:      sp.usage_name ?? sp.name ?? '',
			polynesian_name: sp.polynesian_name ?? '',
		});
	}, [state.mode, selectedSpeciesOpt]);

	// Re-clic sur l'option déjà sélectionnée → désélection.
	const onPickSpecies = useCallback((opt: SpeciesOption) => {
		setSelectedSpeciesKey((prev) => (prev === opt.key ? null : opt.key));
	}, []);

	const onEnterDrawing = useCallback(() => {
		state.enterDrawing();
		setTool('rectangle');
		setSpecies(EMPTY_SPECIES);
		setSelectedSpeciesKey(null);
	}, [state]);

	const onExitDrawing = useCallback(() => {
		state.exitDrawing();
		setSpecies(EMPTY_SPECIES);
		setSelectedSpeciesKey(null);
	}, [state]);

	const onSetCuratorBbox = useCallback((b: CuratorBbox | null) => {
		state.setCuratorBbox(b);
		if (b) setTool('select');
	}, [state]);

	const speciesComplete = species.scientific_name.trim() && species.usage_name.trim() && species.polynesian_name.trim();
	const hasOneSelected  = state.mode === 'review' && state.selectedIds.size === 1;
	const hasCuratorBbox  = state.mode === 'drawing' && !!state.curatorBbox;
	const canCertify      = !!speciesComplete && (hasOneSelected || hasCuratorBbox);

	const disabledHint =
		!speciesComplete ? 'Renseignez les 3 noms d\'espèce.'
		: state.mode === 'review' && state.selectedIds.size === 0 ? 'Sélectionnez une proposition.'
		: state.mode === 'review' && state.selectedIds.size > 1 ? 'Une seule bbox doit être cochée.'
		: state.mode === 'drawing' && !state.curatorBbox ? 'Tracez une bounding box.'
		: null;

	const onCertify = useCallback(async () => {
		if (!canCertify || submitting || !data) return;
		setSubmitting(true);
		try {
			let mode: 'review' | 'create';
			let shape: { points: number[] };
			let chosenAnnotatorId: number | null = null;
			let rejected: any[] = [];
			let sourceName: string | undefined;

			const speciesSourceName = selectedSpeciesOpt?.species?.name
				?? selectedSpeciesOpt?.fallbackLabel
				?? undefined;

			if (state.mode === 'review' && selectedProposal) {
				mode = 'review';
				const p = selectedProposal;
				shape = { points: [p.x, p.y, p.x + p.width, p.y + p.height] };
				chosenAnnotatorId = p.annotator_id;
				sourceName = speciesSourceName ?? p.species?.name ?? p.label_name ?? undefined;
				rejected = proposals
					.filter((q) => q.cvat_shape_id !== p.cvat_shape_id)
					.map((q) => ({
						annotator_id: q.annotator_id,
						cvat_shape_id: q.cvat_shape_id,
						label_name: q.label_name,
					}));
			} else if (state.mode === 'drawing' && state.curatorBbox) {
				mode = 'create';
				const b = state.curatorBbox;
				shape = { points: [b.x, b.y, b.x + b.width, b.y + b.height] };
				sourceName = speciesSourceName;
				rejected = proposals.map((q) => ({
					annotator_id: q.annotator_id,
					cvat_shape_id: q.cvat_shape_id,
					label_name: q.label_name,
				}));
			} else {
				throw new Error('État incohérent.');
			}

			await service.certify(taskId, {
				cvat_job_id: jobId,
				mode,
				chosen_bbox_annotator_id: chosenAnnotatorId,
				shape,
				species: {
					scientific_name: species.scientific_name.trim(),
					usage_name:      species.usage_name.trim(),
					polynesian_name: species.polynesian_name.trim(),
					source_name:     sourceName,
				},
				comment: comment.trim() || undefined,
				rejected_proposals: rejected,
			});

			toast.success('Annotation certifiée.');
			router.replace('/(main)/curator/done' as Href);
		} catch (err: any) {
			const detail = err?.response?.data?.error ?? err?.message ?? 'Certification impossible.';
			toast.error(typeof detail === 'string' ? detail : JSON.stringify(detail));
			setSubmitting(false);
		}
	}, [canCertify, submitting, data, state.mode, state.curatorBbox, selectedProposal, proposals, service, taskId, jobId, species, comment, router]);

	if (loading) {
		return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	}
	if (error || !data) {
		return (
			<View style={styles.center}>
				<Text style={styles.errorText}>Erreur : {error ?? 'données indisponibles'}</Text>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<CuratorSidebarLeft
				mode={state.mode}
				tool={tool}
				proposals={proposals}
				selectedIds={state.selectedIds}
				opacity={state.opacity}
				annotatorColor={state.annotatorColor}
				speciesOptions={speciesOptions}
				selectedSpeciesKey={selectedSpeciesKey}
				onChangeTool={setTool}
				onChangeOpacity={state.setOpacity}
				onChangeColor={state.setAnnotatorColor}
				onToggleSelect={state.toggleSelected}
				onPickSpecies={onPickSpecies}
				onEnterDrawing={onEnterDrawing}
				onExitDrawing={onExitDrawing}
				onZoomIn={() => canvasRef.current?.zoomIn()}
				onZoomOut={() => canvasRef.current?.zoomOut()}
				onZoomReset={() => canvasRef.current?.resetZoom()}
			/>

			<View style={styles.canvasWrap}>
				<CuratorCanvas
					ref={canvasRef}
					jobId={jobId}
					mode={state.mode}
					tool={tool}
					proposals={proposals}
					selectedIds={state.selectedIds}
					annotatorColor={state.annotatorColor}
					opacity={state.opacity}
					curatorBbox={state.curatorBbox}
					onToggleSelect={state.toggleSelected}
					onSetCuratorBbox={onSetCuratorBbox}
					onHover={setHovered}
				/>
				{proposals.length === 0 && state.mode === 'review' ? (
					<View pointerEvents="none" style={styles.emptyBanner}>
						<Text style={styles.emptyText}>Aucune proposition d'annotateur pour ce média.</Text>
						<Text style={styles.emptyHint}>Tu peux tracer ta propre annotation via « + Nouvelle annotation ».</Text>
					</View>
				) : null}
				{hovered ? (
					<BboxTooltip
						proposal={hovered.proposal}
						x={hovered.x}
						y={hovered.y}
					/>
				) : null}
			</View>

			<CuratorSidebarRight
				speciesValue={species}
				comment={comment}
				canCertify={canCertify}
				submitting={submitting}
				disabledHint={disabledHint}
				metadata={data.metadata}
				task={data.task}
				canTypeSpecies={canTypeSpecies}
				speciesApproved={!!isApprovedSelected}
				speciesApprovedName={selectedSpeciesOpt?.displayName ?? null}
				speciesApprovedId={selectedSpeciesOpt?.species?.id ?? null}
				onSpeciesChange={setSpecies}
				onCommentChange={setComment}
				onCertify={onCertify}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, flexDirection: 'row', gap: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.background.main },
	canvasWrap: { flex: 1, position: 'relative', backgroundColor: COLORS.background.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
	emptyBanner: {
		position: 'absolute', top: SPACING.md, left: SPACING.md, right: SPACING.md,
		backgroundColor: `${COLORS.background.card}ee`,
		borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
		paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
		alignItems: 'center',
	},
	emptyText: { fontSize: 13, color: COLORS.text.primary, fontWeight: '600' },
	emptyHint: { fontSize: 12, color: COLORS.text.secondary, marginTop: 2 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
	errorText: { ...TYPOGRAPHY.body, color: COLORS.danger },
});
