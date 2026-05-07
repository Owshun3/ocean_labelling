import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';
import { StudioService } from '@/services/api/StudioService';
import { StudioCanvas } from '../components/StudioCanvas';
import { ValidationPanel } from '../components/ValidationPanel';
import { useInitialShapes } from '../hooks/useInitialShapes';
import { StudioShape, StudioTool } from '../types';

interface Props {
	taskId: number;
	jobId: number;
}

export const StudioScreen: React.FC<Props> = ({ taskId, jobId }) => {
	const router = useRouter();
	const [tool, setTool] = useState<StudioTool>('rectangle');
	const [shapes, setShapes] = useState<StudioShape[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [initialized, setInitialized] = useState(false);
	const studio = useMemo(() => new StudioService(), []);

	const initial = useInitialShapes(jobId);

	useEffect(() => {
		if (initial.loaded && !initialized) {
			setShapes(initial.shapes);
			setSelectedId(initial.shapes[0]?.id ?? null);
			setInitialized(true);
		}
	}, [initial.loaded, initial.shapes, initialized]);

	const addShape = useCallback((shape: StudioShape) => {
		setShapes([shape]);
		setSelectedId(shape.id);
	}, []);

	const updateShape = useCallback((id: string, patch: Partial<StudioShape>) => {
		setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
	}, []);

	const deleteShape = useCallback((id: string) => {
		setShapes((prev) => prev.filter((s) => s.id !== id));
		setSelectedId((cur) => (cur === id ? null : cur));
	}, []);

	const handleValidate = useCallback(async () => {
		if (submitting) return;
		const missing = shapes.filter((s) => !s.speciesName).length;
		if (missing > 0) {
			Alert.alert('Espèces manquantes', `${missing} rectangle(s) sans espèce.`);
			return;
		}
		setSubmitting(true);
		try {
			const updated = await studio.validateAll(taskId, jobId, shapes);
			setShapes(updated);
			router.replace('/(main)/studio/select' as Href);
		} catch (err: any) {
			const detail = err?.response?.data?.error
				?? err?.response?.data?.detail
				?? err?.message
				?? 'Validation impossible.';
			Alert.alert('Erreur', typeof detail === 'string' ? detail : JSON.stringify(detail));
		} finally {
			setSubmitting(false);
		}
	}, [studio, taskId, jobId, shapes, submitting, router]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Delete' || e.key === 'Backspace') {
				const target = e.target as HTMLElement | null;
				const tag = target?.tagName?.toLowerCase();
				if (tag === 'input' || tag === 'textarea') return;
				if (selectedId) {
					e.preventDefault();
					deleteShape(selectedId);
				}
			}
			if (e.key === 'r' || e.key === 'R') setTool('rectangle');
			if (e.key === 'v' || e.key === 'V') setTool('select');
		};
		if (typeof window !== 'undefined') {
			window.addEventListener('keydown', onKey);
			return () => window.removeEventListener('keydown', onKey);
		}
	}, [selectedId, deleteShape]);

	return (
		<View style={styles.container}>
			<View style={styles.toolsColumn}>
				<Text style={styles.colTitle}>Outils</Text>

				<ToolButton active={tool === 'rectangle'} label="Rect" hint="R" glyph="▭" onPress={() => setTool('rectangle')} />
				<ToolButton active={tool === 'select'}    label="Select" hint="V" glyph="➤" onPress={() => setTool('select')} />

				<View style={styles.shapesListWrap}>
					<Text style={styles.shapesTitle}>Shapes ({shapes.length})</Text>
					{shapes.length === 0 ? (
						<Text style={styles.placeholderHint}>aucun</Text>
					) : (
						shapes.map((s, i) => (
							<Pressable
								key={s.id}
								onPress={() => { setTool('select'); setSelectedId(s.id); }}
								style={[styles.shapeRow, selectedId === s.id && styles.shapeRowSelected]}
							>
								<View style={[styles.shapeDot, { backgroundColor: s.status === 'saved' ? COLORS.status.validated : COLORS.warning }]} />
								<Text style={styles.shapeLabel}>#{i + 1}</Text>
							</Pressable>
						))
					)}
				</View>

				<Text style={styles.shortcutHint}>Suppr · supprimer{'\n'}Échap · désélectionner</Text>
			</View>

			<View style={styles.canvasColumn}>
				<StudioCanvas
					jobId={jobId}
					frameNumber={0}
					tool={tool}
					shapes={shapes}
					selectedId={selectedId}
					onAddShape={addShape}
					onSelectShape={setSelectedId}
					onUpdateShape={updateShape}
				/>
			</View>

			<ValidationPanel
				taskId={taskId}
				jobId={jobId}
				shapes={shapes}
				selectedShape={shapes.find((s) => s.id === selectedId) ?? null}
				submitting={submitting}
				onUpdateShape={updateShape}
				onValidate={handleValidate}
			/>
		</View>
	);
};

const ToolButton: React.FC<{ active: boolean; label: string; hint?: string; glyph: string; onPress: () => void }> = ({
	active, label, hint, glyph, onPress,
}) => (
	<Pressable onPress={onPress} style={[styles.toolBtn, active && styles.toolBtnActive]}>
		<Text style={[styles.toolGlyph, active && styles.toolGlyphActive]}>{glyph}</Text>
		<Text style={[styles.toolLabel, active && styles.toolLabelActive]}>{label}</Text>
		{hint ? <Text style={[styles.toolHint, active && styles.toolHintActive]}>{hint}</Text> : null}
	</Pressable>
);

const styles = StyleSheet.create({
	container: {
		flex: 1,
		flexDirection: 'row',
		gap: SPACING.md,
		padding: SPACING.md,
		backgroundColor: COLORS.background.main,
	},

	toolsColumn: {
		width: 100,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.sm,
		gap: SPACING.sm,
	},
	toolBtn: {
		width: '100%',
		aspectRatio: 1,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
		alignItems: 'center',
		justifyContent: 'center',
		gap: 2,
	},
	toolBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
	toolGlyph: { fontSize: 22, color: COLORS.text.primary },
	toolGlyphActive: { color: COLORS.text.inverse },
	toolLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '600' },
	toolLabelActive: { color: COLORS.text.inverse },
	toolHint: { fontSize: 10, color: COLORS.text.placeholder, fontWeight: '700' },
	toolHintActive: { color: COLORS.text.inverse, opacity: 0.8 },

	shapesListWrap: { marginTop: SPACING.md, gap: SPACING.xs },
	shapesTitle: { fontSize: 11, fontWeight: '700', color: COLORS.text.secondary, textTransform: 'uppercase' },
	shapeRow: {
		flexDirection: 'row', alignItems: 'center', gap: 6,
		paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4,
	},
	shapeRowSelected: { backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.primary },
	shapeDot: { width: 8, height: 8, borderRadius: 4 },
	shapeLabel: { fontSize: 12, color: COLORS.text.primary },

	shortcutHint: { fontSize: 10, color: COLORS.text.placeholder, marginTop: 'auto', lineHeight: 14 },

	canvasColumn: {
		flex: 1,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		overflow: 'hidden',
	},

	colTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },
	placeholderHint: { fontSize: 12, color: COLORS.text.placeholder, fontStyle: 'italic' },
});
