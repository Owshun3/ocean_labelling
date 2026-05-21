import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { useRouter, Href } from 'expo-router';
import Svg, { G, Image as SvgImage, Rect as SvgRect } from 'react-native-svg';
import { StudioService, CertifiedView } from '@/services/api/StudioService';
import { useStudioFrame } from '@/features/studio/hooks/useStudioFrame';
import { BackButton } from '@/shared/components/BackButton';
import { RankBadge } from '@/shared/components/RankBadge';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

interface Props { taskId: number }

const CANVAS_W = 720;
const CANVAS_H = 540;

export const StudioCertifiedViewScreen: React.FC<Props> = ({ taskId }) => {
	const router = useRouter();
	const service = useMemo(() => new StudioService(), []);
	const [data, setData] = useState<CertifiedView | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		service.getCertified(taskId)
			.then(setData)
			.catch((err) => toast.error(err?.response?.data?.error ?? err?.message ?? 'Données indisponibles.'))
			.finally(() => setLoading(false));
	}, [service, taskId]);

	const jobId = data?.certification.cvat_job_id ?? null;
	const frame = useStudioFrame(jobId ?? -1, 0);

	if (loading) {
		return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	}
	if (!data) {
		return <View style={styles.center}><Text style={TYPOGRAPHY.body}>Annotation introuvable.</Text></View>;
	}

	const { task, certification, species } = data;
	const speciesLabel = species?.usage_name || species?.scientific_name || species?.name || '—';
	const bbox = certification.bbox?.points ?? null;
	const img = frame.image;

	let scale = 1, offsetX = 0, offsetY = 0;
	if (img) {
		scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height);
		offsetX = (CANVAS_W - img.width * scale) / 2;
		offsetY = (CANVAS_H - img.height * scale) / 2;
	}

	return (
		<View style={[styles.container, styles.content]}>
			<View style={styles.headerRow}>
				<View style={{ flex: 1 }}>
					<Text style={styles.title}>{task.name}</Text>
					<Text style={styles.subtitle}>Annotation finale certifiée par un curator</Text>
				</View>
				{species?.id ? (
					<Pressable onPress={() => router.push(`/(main)/species/${species.id}` as Href)} style={styles.fichBtn}>
						<Text style={styles.fichBtnText}>Fiche espèce ↗</Text>
					</Pressable>
				) : null}
			</View>

			<View style={styles.row}>
				<View style={styles.canvasWrap}>
					{img ? (
						<Svg width={CANVAS_W} height={CANVAS_H}>
							<SvgRect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="#000" />
							<G transform={`translate(${offsetX}, ${offsetY}) scale(${scale})`}>
								<SvgImage href={img.uri} width={img.width} height={img.height} preserveAspectRatio="none" />
								{bbox && bbox.length === 4 ? (
									<SvgRect
										x={Math.min(bbox[0], bbox[2])}
										y={Math.min(bbox[1], bbox[3])}
										width={Math.abs(bbox[2] - bbox[0])}
										height={Math.abs(bbox[3] - bbox[1])}
										stroke="#06b6d4"
										strokeWidth={3 / scale}
										fill="rgba(6, 182, 212, 0.18)"
									/>
								) : null}
							</G>
						</Svg>
					) : (
						<View style={styles.canvasFallback}>
							{frame.error ? <Text style={styles.canvasFallbackText}>{frame.error}</Text>
							 : <ActivityIndicator size="large" color={COLORS.primary} />}
						</View>
					)}
				</View>

				<View style={styles.sidebar}>
					<View style={styles.block}>
						<Text style={styles.blockTitle}>Espèce certifiée</Text>
						<Text style={styles.speciesName}>{speciesLabel}</Text>
						{species?.scientific_name && species.scientific_name !== speciesLabel ? (
							<Text style={styles.speciesSub}>{species.scientific_name}</Text>
						) : null}
						{species?.polynesian_name ? (
							<Text style={styles.speciesSub}>{species.polynesian_name}</Text>
						) : null}
					</View>

					<View style={styles.block}>
						<Text style={styles.blockTitle}>Certifié par</Text>
						{certification.curator ? (
							<View style={styles.curatorRow}>
								<Text style={styles.curatorName}>{certification.curator.username ?? `#${certification.curator.id}`}</Text>
								<RankBadge actions={certification.curator.actions_validated_total} size="sm" withCount />
							</View>
						) : <Text style={styles.dim}>Inconnu</Text>}
						<Text style={styles.dim}>
							{new Date(certification.certified_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
						</Text>
						<Text style={styles.dim}>
							Mode : {certification.mode === 'review' ? 'bbox annotateur retenue' : 'bbox tracée par le curator'}
						</Text>
					</View>

					{certification.curator_comment ? (
						<View style={styles.block}>
							<Text style={styles.blockTitle}>Commentaire curator</Text>
							<Text style={styles.commentText}>{certification.curator_comment}</Text>
						</View>
					) : null}
				</View>
			</View>

			<View style={styles.footer}>
				<BackButton />
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2, gap: SPACING.md },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

	headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
	title: { ...TYPOGRAPHY.h1 },
	subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic' },
	fichBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, backgroundColor: COLORS.primary },
	fichBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 13 },

	row: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start', flexWrap: 'wrap' },
	canvasWrap: { width: CANVAS_W, height: CANVAS_H, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#000' },
	canvasFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background.main },
	canvasFallbackText: { ...TYPOGRAPHY.body, color: COLORS.danger },

	sidebar: { flex: 1, minWidth: 260, gap: SPACING.md },
	block: { backgroundColor: COLORS.background.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: 4 },
	blockTitle: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
	speciesName: { fontSize: 16, color: COLORS.text.primary, fontWeight: '700' },
	speciesSub: { fontSize: 12, color: COLORS.text.secondary, fontStyle: 'italic' },
	curatorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
	curatorName: { fontSize: 14, color: COLORS.text.primary, fontWeight: '600' },
	dim: { fontSize: 12, color: COLORS.text.secondary },
	commentText: { fontSize: 13, color: COLORS.text.primary, lineHeight: 19, fontStyle: 'italic' },

	footer: { marginTop: SPACING.lg },
});
