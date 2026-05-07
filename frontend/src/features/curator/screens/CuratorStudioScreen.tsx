import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

interface Props {
	taskId: number;
	jobId: number;
}

export const CuratorStudioScreen: React.FC<Props> = ({ taskId, jobId }) => {
	return (
		<View style={styles.container}>
			<View style={styles.toolsColumn}>
				<Text style={styles.colTitle}>Outils</Text>
				<Text style={styles.placeholderHint}>(à venir)</Text>
			</View>

			<View style={styles.canvasColumn}>
				<View style={styles.canvasInner}>
					<Text style={styles.canvasPlaceholder}>Studio curator — à construire</Text>
					<Text style={styles.canvasHint}>Tâche #{taskId} · Job #{jobId}</Text>
					<Text style={styles.canvasHint}>(overlay multi-annotateur, sélection/fusion, validation finale)</Text>
				</View>
			</View>

			<View style={styles.panelColumn}>
				<Text style={styles.colTitle}>Validation finale</Text>
				<Text style={styles.placeholderHint}>(à venir)</Text>
			</View>
		</View>
	);
};

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
	canvasColumn: {
		flex: 1,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		overflow: 'hidden',
	},
	canvasInner: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		gap: SPACING.xs,
	},
	canvasPlaceholder: { ...TYPOGRAPHY.h2 },
	canvasHint: { fontSize: 12, color: COLORS.text.placeholder, fontStyle: 'italic' },
	panelColumn: {
		width: 300,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.md,
		gap: SPACING.sm,
	},
	colTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },
	placeholderHint: { fontSize: 12, color: COLORS.text.placeholder, fontStyle: 'italic' },
});
