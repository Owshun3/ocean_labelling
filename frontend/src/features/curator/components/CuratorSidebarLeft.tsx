import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { Proposal } from '@/services/api/CuratorService';
import type { CuratorMode, CuratorOpacity } from '../hooks/useCuratorMode';
import type { StudioTool } from '@/features/studio/types';
import { BboxProposalList } from './BboxProposalList';
import { SpeciesProposalList, SpeciesOption } from './SpeciesProposalList';
import { OpacityRadio } from './OpacityRadio';
import { ColorPicker } from './ColorPicker';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

interface Props {
	mode: CuratorMode;
	tool: StudioTool;
	proposals: Proposal[];
	selectedIds: Set<number>;
	opacity: CuratorOpacity;
	annotatorColor: string;
	speciesOptions:   SpeciesOption[];
	selectedSpeciesKey: string | null;
	onChangeTool:    (t: StudioTool) => void;
	onChangeOpacity: (o: CuratorOpacity) => void;
	onChangeColor:   (c: string) => void;
	onToggleSelect:  (id: number, kind: 'single' | 'toggle' | 'range', ordered: number[]) => void;
	onPickSpecies:   (opt: SpeciesOption) => void;
	onEnterDrawing:  () => void;
	onExitDrawing:   () => void;
	onZoomIn:    () => void;
	onZoomOut:   () => void;
	onZoomReset: () => void;
}

export const CuratorSidebarLeft: React.FC<Props> = ({
	mode, tool, proposals, selectedIds, opacity, annotatorColor,
	speciesOptions, selectedSpeciesKey,
	onChangeTool, onChangeOpacity, onChangeColor, onToggleSelect, onPickSpecies,
	onEnterDrawing, onExitDrawing,
	onZoomIn, onZoomOut, onZoomReset,
}) => {
	const drawing = mode === 'drawing';

	return (
		<View style={styles.col}>
			<View style={styles.block}>
				<Text style={styles.heading}>Outils</Text>
				<View style={styles.toolsRow}>
					<ToolButton glyph="▭" label="Rect"     active={tool === 'rectangle'} onPress={() => onChangeTool('rectangle')} />
					<ToolButton glyph="➤" label="Select"   active={tool === 'select'}    onPress={() => onChangeTool('select')} />
					<ToolButton glyph="✋" label="Déplacer" active={tool === 'pan'}       onPress={() => onChangeTool('pan')} />
				</View>
				<View style={styles.zoomRow}>
					<Pressable onPress={onZoomOut}   style={styles.zoomBtn}><Text style={styles.zoomGlyph}>−</Text></Pressable>
					<Pressable onPress={onZoomIn}    style={styles.zoomBtn}><Text style={styles.zoomGlyph}>+</Text></Pressable>
					<Pressable onPress={onZoomReset} style={styles.zoomReset}><Text style={styles.zoomResetText}>Ajuster</Text></Pressable>
				</View>
			</View>

			<View style={styles.block}>
				<Text style={styles.heading}>Espèces proposées ({speciesOptions.length})</Text>
				<SpeciesProposalList
					options={speciesOptions}
					selectedKey={selectedSpeciesKey}
					onSelect={onPickSpecies}
				/>
			</View>

			<View style={styles.block}>
				<Text style={styles.heading}>Bbox proposées ({proposals.length})</Text>
				<BboxProposalList
					proposals={proposals}
					selectedIds={selectedIds}
					onToggle={onToggleSelect}
				/>
			</View>

			<View style={styles.block}>
				<OpacityRadio value={opacity} onChange={onChangeOpacity} />
				<View style={{ height: SPACING.sm }} />
				<ColorPicker value={annotatorColor} onChange={onChangeColor} />
			</View>

			<View style={styles.actionBlock}>
				{drawing ? (
					<Pressable onPress={onExitDrawing} style={[styles.actionBtn, styles.cancelBtn]}>
						<Text style={styles.cancelBtnText}>Annuler</Text>
					</Pressable>
				) : (
					<Pressable onPress={onEnterDrawing} style={[styles.actionBtn, styles.newBtn]}>
						<Text style={styles.newBtnText}>+ Nouvelle annotation</Text>
					</Pressable>
				)}
				<Text style={styles.helperText}>
					Privilégiez la sélection d'une bbox proposée. N'annotez vous-même que si aucune n'est correcte.
				</Text>
			</View>
		</View>
	);
};

const ToolButton: React.FC<{ glyph: string; label: string; active: boolean; onPress: () => void }> = ({ glyph, label, active, onPress }) => (
	<Pressable onPress={onPress} style={[styles.toolBtn, active && styles.toolBtnActive]}>
		<Text style={[styles.toolGlyph, active && styles.toolGlyphActive]}>{glyph}</Text>
		<Text style={[styles.toolLabel, active && styles.toolLabelActive]}>{label}</Text>
	</Pressable>
);

const styles = StyleSheet.create({
	col: {
		width: 290,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.md,
		gap: SPACING.md,
	},
	block: { gap: SPACING.xs },
	heading: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },

	toolsRow: { flexDirection: 'row', gap: 6 },
	toolBtn: {
		flex: 1, aspectRatio: 1.4, borderRadius: 6,
		borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
		alignItems: 'center', justifyContent: 'center', gap: 2,
	},
	toolBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
	toolGlyph: { fontSize: 18, color: COLORS.text.primary },
	toolGlyphActive: { color: COLORS.text.inverse },
	toolLabel: { fontSize: 10, color: COLORS.text.secondary, fontWeight: '600' },
	toolLabelActive: { color: COLORS.text.inverse },

	zoomRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
	zoomBtn: {
		flex: 1, paddingVertical: 6, borderRadius: 6,
		borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
		alignItems: 'center',
	},
	zoomGlyph: { fontSize: 16, color: COLORS.text.primary, fontWeight: '700' },
	zoomReset: {
		flex: 2, paddingVertical: 6, borderRadius: 6,
		borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
		alignItems: 'center',
	},
	zoomResetText: { fontSize: 11, color: COLORS.text.primary, fontWeight: '600' },

	actionBlock: { gap: SPACING.xs, marginTop: 'auto' },
	actionBtn: { paddingVertical: SPACING.sm, borderRadius: 6, alignItems: 'center' },
	newBtn: { backgroundColor: COLORS.primary },
	newBtnText: { color: COLORS.text.inverse, fontSize: 13, fontWeight: '600' },
	cancelBtn: { backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.danger },
	cancelBtnText: { color: COLORS.danger, fontSize: 13, fontWeight: '600' },
	helperText: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic' },
});
