import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

interface ReasonOption {
	id: string;
	label: string;
}

const PRESET_REASONS: ReasonOption[] = [
	{ id: 'spam',       label: 'Spam ou contenu publicitaire' },
	{ id: 'bot',        label: 'Comportement de bot' },
	{ id: 'off_topic',  label: 'Non conforme à la charte' },
	{ id: 'political',  label: 'Contenu politique' },
	{ id: 'adult',      label: 'Contenu pour adultes' },
	{ id: 'other',      label: 'Autre (préciser)' },
];

interface Props {
	disabled?: boolean;
	value: string;
	onChange: (reason: string) => void;
}

export function getPresetReasonIds(): string[] {
	return PRESET_REASONS.map((r) => r.id);
}

export const RejectReasonPicker: React.FC<Props> = ({ disabled, value, onChange }) => {
	const initialPresetId = PRESET_REASONS.find((r) => r.label === value)?.id;
	const [selectedId, setSelectedId] = useState<string | null>(initialPresetId ?? (value ? 'other' : null));
	const [customText, setCustomText] = useState<string>(initialPresetId ? '' : value);

	const pickPreset = (opt: ReasonOption) => {
		setSelectedId(opt.id);
		if (opt.id === 'other') {
			onChange(customText);
		} else {
			setCustomText('');
			onChange(opt.label);
		}
	};

	const onCustomTextChange = (t: string) => {
		setCustomText(t);
		if (selectedId === 'other') onChange(t);
	};

	return (
		<View style={styles.wrap}>
			{PRESET_REASONS.map((opt) => {
				const active = selectedId === opt.id;
				return (
					<Pressable
						key={opt.id}
						disabled={disabled}
						onPress={() => pickPreset(opt)}
						style={({ hovered }: any) => [
							styles.row,
							active && styles.rowActive,
							hovered && !active && styles.rowHover,
						]}
					>
						<View style={[styles.radio, active && styles.radioActive]}>
							{active ? <View style={styles.radioDot} /> : null}
						</View>
						<Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
					</Pressable>
				);
			})}
			{selectedId === 'other' ? (
				<TextInput
					value={customText}
					onChangeText={onCustomTextChange}
					placeholder="Décris le motif…"
					placeholderTextColor={COLORS.text.placeholder}
					multiline
					editable={!disabled}
					style={styles.textArea}
				/>
			) : null}
		</View>
	);
};

const styles = StyleSheet.create({
	wrap: { gap: 4 },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: SPACING.sm,
		paddingVertical: 6,
		paddingHorizontal: SPACING.sm,
		borderRadius: 6,
	},
	rowActive: { backgroundColor: `${COLORS.warning}18` },
	rowHover: { backgroundColor: COLORS.background.main },
	radio: {
		width: 16, height: 16, borderRadius: 8,
		borderWidth: 1.5, borderColor: COLORS.border,
		alignItems: 'center', justifyContent: 'center',
	},
	radioActive: { borderColor: COLORS.warning },
	radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.warning },
	label: { ...TYPOGRAPHY.body, fontSize: 13, color: COLORS.text.primary, flex: 1 },
	labelActive: { fontWeight: '600' },
	textArea: {
		marginTop: SPACING.xs,
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main,
		minHeight: 60, textAlignVertical: 'top',
	},
});
