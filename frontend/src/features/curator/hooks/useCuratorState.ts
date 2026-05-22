import { useCallback, useMemo, useState } from 'react';
import type { Proposal, ProposalSpecies } from '@/services/api/CuratorService';

export type CuratorTool = 'rectangle' | 'select' | 'pan';

export interface CuratorBbox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface WipCertification {
	localId: string;
	speciesKey: string;
	mode: 'review' | 'create';
	shape: CuratorBbox;
	chosenProposalId: number | null;
	comment?: string;
}

export type DecisionStatus = 'pending' | 'accepted' | 'rejected';

export interface SpeciesDecision {
	status: DecisionStatus;
	certifications: WipCertification[];
}

export interface SpeciesPreview {
	speciesKey: string;
	species: ProposalSpecies | null;
	proposalsCount: number;
	proposalIds: number[];
}

export function speciesKeyOf(s: ProposalSpecies | null, fallbackLabel?: string | null): string {
	if (s && typeof s.id === 'number' && s.id !== 0) return `id:${s.id}`;
	if (s?.scientific_name) return s.scientific_name.trim().toLowerCase();
	if (s?.name)            return s.name.trim().toLowerCase();
	if (fallbackLabel)      return fallbackLabel.trim().toLowerCase();
	return '__unknown__';
}

export interface CuratorStateApi {
	proposedGroups: SpeciesPreview[];
	manualGroups: SpeciesPreview[];
	allGroups: SpeciesPreview[];
	decisions: Map<string, SpeciesDecision>;
	statusOf: (speciesKey: string) => DecisionStatus;

	selectedSpeciesKey: string | null;
	setSelectedSpeciesKey: (k: string | null) => void;

	tool: CuratorTool;
	setTool: (t: CuratorTool) => void;

	drawingBbox: CuratorBbox | null;
	setDrawingBbox: (b: CuratorBbox | null) => void;

	acceptProposal: (speciesKey: string, proposal: Proposal) => void;
	acceptOwnBbox:  (speciesKey: string, bbox: CuratorBbox) => void;
	rejectSpecies:  (speciesKey: string) => void;
	resetDecision:  (speciesKey: string) => void;
	importExistingSpecies: (species: ProposalSpecies) => 'ok' | 'duplicate';
	createDraftSpecies: () => void;
	removeManualSpecies: (speciesKey: string) => void;
	replaceManualSpecies: (oldKey: string, newSpecies: ProposalSpecies) => string;
	removeCertification: (speciesKey: string, certLocalId: string) => void;

	allCertifications: WipCertification[];

	canFinalize: boolean;
	pendingCount: number;

	wizardOpen: boolean;
	openWizard:  () => void;
	closeWizard: () => void;
}

let LOCAL_ID = 0;
const nextLocalId = () => `wip-${++LOCAL_ID}`;

let MANUAL_SPECIES_ID = 0;
const nextManualSpeciesId = () => --MANUAL_SPECIES_ID;

let MANUAL_SPECIES_LABEL = 0;
const nextManualSpeciesLabel = () => ++MANUAL_SPECIES_LABEL;

export function useCuratorState(proposals: Proposal[]): CuratorStateApi {
	const [decisions, setDecisions] = useState<Map<string, SpeciesDecision>>(new Map());
	const [manualPreviews, setManualPreviews] = useState<Map<string, SpeciesPreview>>(new Map());
	const [selectedSpeciesKey, setSelectedSpeciesKey] = useState<string | null>(null);
	const [tool, setTool] = useState<CuratorTool>('select');
	const [drawingBbox, setDrawingBbox] = useState<CuratorBbox | null>(null);
	const [wizardOpen, setWizardOpen] = useState(false);

	const proposedGroups: SpeciesPreview[] = useMemo(() => {
		const map = new Map<string, SpeciesPreview>();
		for (const p of proposals) {
			const key = speciesKeyOf(p.species, p.label_name);
			const existing = map.get(key);
			if (existing) {
				existing.proposalsCount += 1;
				existing.proposalIds.push(p.cvat_shape_id);
			} else {
				map.set(key, {
					speciesKey: key,
					species: p.species,
					proposalsCount: 1,
					proposalIds: [p.cvat_shape_id],
				});
			}
		}
		return Array.from(map.values());
	}, [proposals]);

	const manualGroups: SpeciesPreview[] = useMemo(
		() => Array.from(manualPreviews.values()),
		[manualPreviews],
	);

	const allGroups: SpeciesPreview[] = useMemo(
		() => [...proposedGroups, ...manualGroups],
		[proposedGroups, manualGroups],
	);

	const statusOf = useCallback(
		(speciesKey: string): DecisionStatus => decisions.get(speciesKey)?.status ?? 'pending',
		[decisions],
	);

	const upsertDecision = useCallback((speciesKey: string, mut: (d: SpeciesDecision) => SpeciesDecision) => {
		setDecisions((prev) => {
			const next = new Map(prev);
			const current = next.get(speciesKey) ?? { status: 'pending' as const, certifications: [] };
			next.set(speciesKey, mut(current));
			return next;
		});
	}, []);

	const acceptProposal = useCallback((speciesKey: string, proposal: Proposal) => {
		upsertDecision(speciesKey, (d) => {
			const existing = d.certifications.find((c) => c.chosenProposalId === proposal.cvat_shape_id);
			if (existing) {
				const remaining = d.certifications.filter((c) => c.localId !== existing.localId);
				return {
					status: remaining.length > 0 ? 'accepted' : 'pending',
					certifications: remaining,
				};
			}
			return {
				status: 'accepted',
				certifications: [
					...d.certifications,
					{
						localId: nextLocalId(),
						speciesKey,
						mode: 'review',
						shape: { x: proposal.x, y: proposal.y, width: proposal.width, height: proposal.height },
						chosenProposalId: proposal.cvat_shape_id,
					},
				],
			};
		});
	}, [upsertDecision]);

	const acceptOwnBbox = useCallback((speciesKey: string, bbox: CuratorBbox) => {
		upsertDecision(speciesKey, (d) => ({
			status: 'accepted',
			certifications: [
				...d.certifications,
				{
					localId: nextLocalId(),
					speciesKey,
					mode: 'create',
					shape: { ...bbox },
					chosenProposalId: null,
				},
			],
		}));
	}, [upsertDecision]);

	const rejectSpecies = useCallback((speciesKey: string) => {
		upsertDecision(speciesKey, () => ({ status: 'rejected', certifications: [] }));
	}, [upsertDecision]);

	const resetDecision = useCallback((speciesKey: string) => {
		setDecisions((prev) => {
			const next = new Map(prev);
			next.delete(speciesKey);
			return next;
		});
	}, []);

	const removeCertification = useCallback((speciesKey: string, certLocalId: string) => {
		upsertDecision(speciesKey, (d) => {
			const remaining = d.certifications.filter((c) => c.localId !== certLocalId);
			return {
				status: remaining.length > 0 ? 'accepted' : 'pending',
				certifications: remaining,
			};
		});
	}, [upsertDecision]);

	const importExistingSpecies = useCallback((species: ProposalSpecies): 'ok' | 'duplicate' => {
		const key = speciesKeyOf(species);
		const inProposed = proposedGroups.some((g) => g.speciesKey === key);
		const inManual   = manualPreviews.has(key);
		if (inProposed || inManual) return 'duplicate';
		setManualPreviews((prev) => {
			const next = new Map(prev);
			next.set(key, { speciesKey: key, species, proposalsCount: 0, proposalIds: [] });
			return next;
		});
		setSelectedSpeciesKey(key);
		setWizardOpen(false);
		setDrawingBbox(null);
		return 'ok';
	}, [proposedGroups, manualPreviews]);

	const createDraftSpecies = useCallback(() => {
		const idx = nextManualSpeciesLabel();
		const stub: ProposalSpecies = {
			id: nextManualSpeciesId(),
			name: `Nouvelle espèce #${idx}`,
			scientific_name: null,
			usage_name: null,
			polynesian_name: null,
			tags: [],
			status: 'pending',
		};
		const key = speciesKeyOf(stub);
		setManualPreviews((prev) => {
			const next = new Map(prev);
			next.set(key, { speciesKey: key, species: stub, proposalsCount: 0, proposalIds: [] });
			return next;
		});
		setSelectedSpeciesKey(key);
		setWizardOpen(false);
		setDrawingBbox(null);
	}, []);

	const replaceManualSpecies = useCallback((oldKey: string, newSpecies: ProposalSpecies): string => {
		const newKey = speciesKeyOf(newSpecies);
		setManualPreviews((prev) => {
			const old = prev.get(oldKey);
			if (!old) return prev;
			const next = new Map(prev);
			next.delete(oldKey);
			next.set(newKey, { ...old, speciesKey: newKey, species: newSpecies });
			return next;
		});
		setDecisions((prev) => {
			const old = prev.get(oldKey);
			if (!old) return prev;
			const next = new Map(prev);
			next.delete(oldKey);
			next.set(newKey, {
				...old,
				certifications: old.certifications.map((c) => ({ ...c, speciesKey: newKey })),
			});
			return next;
		});
		setSelectedSpeciesKey((cur) => (cur === oldKey ? newKey : cur));
		return newKey;
	}, []);

	const removeManualSpecies = useCallback((key: string) => {
		setManualPreviews((prev) => {
			if (!prev.has(key)) return prev;
			const next = new Map(prev);
			next.delete(key);
			return next;
		});
		setDecisions((prev) => {
			if (!prev.has(key)) return prev;
			const next = new Map(prev);
			next.delete(key);
			return next;
		});
		setSelectedSpeciesKey((cur) => (cur === key ? null : cur));
	}, []);

	const allCertifications: WipCertification[] = useMemo(
		() => Array.from(decisions.values()).flatMap((d) => d.certifications),
		[decisions],
	);

	const openWizard = useCallback(() => {
		setWizardOpen(true);
		setDrawingBbox(null);
	}, []);

	const closeWizard = useCallback(() => {
		setWizardOpen(false);
		setDrawingBbox(null);
	}, []);

	const pendingCount = useMemo(
		() => proposedGroups.filter((g) => statusOf(g.speciesKey) === 'pending').length,
		[proposedGroups, statusOf],
	);

	const canFinalize = pendingCount === 0;

	return {
		proposedGroups, manualGroups, allGroups,
		decisions, statusOf,
		selectedSpeciesKey, setSelectedSpeciesKey,
		tool, setTool,
		drawingBbox, setDrawingBbox,
		acceptProposal, acceptOwnBbox, rejectSpecies, resetDecision,
		importExistingSpecies, createDraftSpecies, removeManualSpecies, replaceManualSpecies, removeCertification,
		allCertifications,
		canFinalize, pendingCount,
		wizardOpen, openWizard, closeWizard,
	};
}
