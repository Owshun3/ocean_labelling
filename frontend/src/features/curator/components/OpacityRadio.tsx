import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { CuratorOpacity } from '../hooks/useCuratorMode';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

const OPTIONS: Array<{ id: CuratorOpacity; label: string }> = [
	{ id: 'hidden', label: 'Cachée'   },
	{ id: 'dim',    label: 'Légère'   },
	{ id: 'normal', label: 'Opaque'   },
];

interface Props {
	value: CuratorOpacity;
	onChange: (v: CuratorOpacity) => void;
}

export const OpacityRadio: React.FC<Props> = ({ value, onChange }) => (
	<View style={styles.wrap}>
		<Text style={styles.label}>Opacité non sélectionnées</Text>
		<View style={styles.row}>
			{OPTIONS.map((o) => {
				const active = value === o.id;
				return (
					<Pressable
						key={o.id}
						onPress={() => onChange(o.id)}
						style={[styles.pill, active && styles.pillActive]}
					>
						<Text style={[styles.pillText, active && styles.pillTextActive]}>{o.label}</Text>
					</Pressable>
				);
			})}
		</View>
	</View>
);

const styles = StyleSheet.create({
	wrap:  { gap: 4 },
	label: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	row:   { flexDirection: 'row', gap: 4 },
	pill: {
		flex: 1,
		paddingVertical: 6,
		alignItems: 'center',
		borderRadius: 6,
		borderWidth: 1,
		borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	pillActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
	pillText:   { fontSize: 11, color: COLORS.text.primary, fontWeight: '600' },
	pillTextActive: { color: COLORS.text.inverse },
});
