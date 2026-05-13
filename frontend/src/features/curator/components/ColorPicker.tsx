import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ANNOTATOR_PALETTE } from '../utils/annotatorColors';
import { COLORS } from '@/shared/theme/colors';

interface Props {
	value: string;
	onChange: (color: string) => void;
}

export const ColorPicker: React.FC<Props> = ({ value, onChange }) => (
	<View style={styles.wrap}>
		<Text style={styles.label}>Couleur des propositions</Text>
		<View style={styles.row}>
			{ANNOTATOR_PALETTE.map((c) => {
				const active = c === value;
				return (
					<Pressable
						key={c}
						onPress={() => onChange(c)}
						style={[styles.swatch, { backgroundColor: c }, active && styles.swatchActive]}
					/>
				);
			})}
		</View>
	</View>
);

const styles = StyleSheet.create({
	wrap: { gap: 4 },
	label: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	row:   { flexDirection: 'row', gap: 6 },
	swatch: {
		width: 24, height: 24, borderRadius: 12,
		borderWidth: 2, borderColor: 'transparent',
	},
	swatchActive: { borderColor: COLORS.text.primary },
});
