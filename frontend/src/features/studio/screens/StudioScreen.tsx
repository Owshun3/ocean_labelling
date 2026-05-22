import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { toast } from '@/shared/toast/Toast';
import { useRouter, Href } from 'expo-router';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';
import { StudioService } from '@/services/api/StudioService';
import { StudioCanvas, StudioCanvasHandle } from '../components/StudioCanvas';
import { ValidationPanel } from '../components/ValidationPanel';
import { BboxListPanel } from '../components/BboxListPanel';
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
	const canvasRef = useRef<StudioCanvasHandle>(null);

	const initial = useInitialShapes(jobId);

	useEffect(() => {
		if (initial.loaded && !initialized) {
			if (initial.curatorLocked) {
				toast.error('Ce média a déjà été validé par un curator. L\'annotation n\'est plus possible.');
				router.replace('/(main)/studio/select' as Href);
				return;
			}
			setShapes(initial.shapes);
			setSelectedId(initial.shapes[0]?.id ?? null);
			setInitialized(true);
		}
	}, [initial.loaded, initial.shapes, initial.curatorLocked, initialized, router]);

	const addShape = useCallback((shape: StudioShape) => {
		setShapes((prev) => [...prev, shape]);
		setSelectedId(shape.id);
	}, []);

	const updateShape = useCallback((id: string, patch: Partial<StudioShape>) => {
		setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
	}, []);

	const deleteShape = useCallback((id: string) => {
		setShapes((prev) => prev.filter((s) => s.id !== id));
		setSelectedId((cur) => (cur === id ? null : cur));
	}, []);

	const saveShape = useCallback((id: string) => {
		setShapes((prev) => prev.map((s) => (s.id === id && s.speciesName ? { ...s, status: 'saved' } : s)));
	}, []);

	const handleValidate = useCallback(async () => {
		if (submitting) return;
		const missing = shapes.filter((s) => !s.speciesName).length;
		if (missing > 0) {
			toast.error(`${missing} rectangle(s) sans espèce. Renseigne-les avant de soumettre.`);
			return;
		}
		setSubmitting(true);
		try {
			const updated = await studio.validateAll(taskId, jobId, shapes);
			setShapes(updated);
			toast.success('Annotation soumise.');
			router.replace('/(main)/studio/select' as Href);
		} catch (err: any) {
			const status = err?.response?.status;
			const errCode = err?.response?.data?.error;
			if (status === 409 && errCode === 'curator_locked') {
				const msg = err?.response?.data?.message
					?? 'Ce média vient d\'être validé par un curator. Tes annotations en cours ne seront pas conservées.';
				toast.error(msg);
				setSubmitting(false);
				router.replace('/(main)/studio/select' as Href);
				return;
			}
			const detail = errCode
				?? err?.response?.data?.detail
				?? err?.message
				?? 'Validation impossible.';
			toast.error(typeof detail === 'string' ? detail : JSON.stringify(detail));
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
			if (e.key === 'p' || e.key === 'P') setTool('pan');
			if (e.key === '+' || e.key === '=') canvasRef.current?.zoomIn();
			if (e.key === '-' || e.key === '_') canvasRef.current?.zoomOut();
			if (e.key === '0')                  canvasRef.current?.resetZoom();
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

				<ToolButton active={tool === 'rectangle'} label="Rect"   hint="R" glyph="▭" onPress={() => setTool('rectangle')} />
				<ToolButton active={tool === 'select'}    label="Select" hint="V" glyph="➤" onPress={() => setTool('select')} />
				<ToolButton active={tool === 'pan'}       label="Déplacer" hint="P" glyph="✋" onPress={() => setTool('pan')} />

				<View style={styles.zoomBlock}>
					<Text style={styles.shapesTitle}>Zoom</Text>
					<View style={styles.zoomRow}>
						<Pressable onPress={() => canvasRef.current?.zoomOut()} style={styles.zoomBtn}>
							<Text style={styles.zoomGlyph}>−</Text>
						</Pressable>
						<Pressable onPress={() => canvasRef.current?.zoomIn()} style={styles.zoomBtn}>
							<Text style={styles.zoomGlyph}>+</Text>
						</Pressable>
					</View>
					<Pressable onPress={() => canvasRef.current?.resetZoom()} style={styles.zoomResetBtn}>
						<Text style={styles.zoomResetText}>Réajuster</Text>
					</Pressable>
				</View>

				<Text style={styles.shortcutHint}>
					Échap · désélectionner{'\n'}
					Suppr · effacer la boîte{'\n'}
					+/− · zoom · 0 · ajuster{'\n'}
					R · rect  V · sélect  P · pan
				</Text>
			</View>

			<BboxListPanel
				shapes={shapes}
				selectedId={selectedId}
				onSelect={setSelectedId}
				onDelete={deleteShape}
			/>

			<View style={styles.canvasColumn}>
				<StudioCanvas
					ref={canvasRef}
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
				shapes={shapes}
				selectedShape={shapes.find((s) => s.id === selectedId) ?? null}
				submitting={submitting}
				onUpdateShape={updateShape}
				onSaveShape={saveShape}
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

	zoomBlock: { marginTop: SPACING.md, gap: 4 },
	zoomRow:   { flexDirection: 'row', gap: 4 },
	zoomBtn: {
		flex: 1,
		aspectRatio: 1,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
		alignItems: 'center',
		justifyContent: 'center',
	},
	zoomGlyph: { fontSize: 18, color: COLORS.text.primary, fontWeight: '700' },
	zoomResetBtn: {
		paddingVertical: 6,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
		alignItems: 'center',
	},
	zoomResetText: { fontSize: 11, color: COLORS.text.primary, fontWeight: '600' },

	shapesTitle: { fontSize: 11, fontWeight: '700', color: COLORS.text.secondary, textTransform: 'uppercase' },

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
});
