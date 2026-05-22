import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { ANNOTATOR_PALETTE } from '../utils/annotatorColors';
import type { SpeciesStyle } from '../hooks/useSpeciesStyles';

interface Props {
	style: SpeciesStyle;
	onChangeColor:   (color: string) => void;
	onChangeOpacity: (opacity: number) => void;
}

export const SpeciesStylePanel: React.FC<Props> = ({ style, onChangeColor, onChangeOpacity }) => {
	return (
		<View style={styles.wrap}>
			<Text style={styles.title}>Personnalisation</Text>

			<View style={styles.swatchRow}>
				{ANNOTATOR_PALETTE.map((c) => {
					const active = c.toLowerCase() === style.color.toLowerCase();
					return (
						<Pressable
							key={c}
							onPress={() => onChangeColor(c)}
							style={[styles.swatch, { backgroundColor: c }, active && styles.swatchActive]}
						>
							{active ? <Text style={styles.swatchMark}>✓</Text> : null}
						</Pressable>
					);
				})}
			</View>

			<OpacitySlider value={style.opacity} onChange={onChangeOpacity} />
		</View>
	);
};

interface SliderProps {
	value: number;
	onChange: (v: number) => void;
}

const OpacitySlider: React.FC<SliderProps> = ({ value, onChange }) => {
	const [trackWidth, setTrackWidth] = useState(0);
	const draggingRef = useRef(false);
	const trackRef = useRef<View>(null);

	const compute = useCallback((clientX: number) => {
		if (Platform.OS !== 'web' || trackWidth <= 0 || !trackRef.current) return;
		const node = trackRef.current as unknown as HTMLElement;
		const rect = node.getBoundingClientRect?.();
		if (!rect) return;
		const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		onChange(Math.round(ratio * 100) / 100);
	}, [trackWidth, onChange]);

	const webProps = Platform.OS === 'web' ? {
		onMouseDown: (e: any) => {
			draggingRef.current = true;
			compute(e.clientX);
			const onMove = (ev: MouseEvent) => { if (draggingRef.current) compute(ev.clientX); };
			const onUp   = () => {
				draggingRef.current = false;
				window.removeEventListener('mousemove', onMove);
				window.removeEventListener('mouseup',   onUp);
			};
			window.addEventListener('mousemove', onMove);
			window.addEventListener('mouseup',   onUp);
		},
	} as any : {};

	const pct = Math.round(value * 100);
	return (
		<View style={styles.sliderBlock}>
			<View style={styles.sliderHeader}>
				<Text style={styles.sliderLabel}>Opacité</Text>
				<Text style={styles.sliderValue}>{pct}%</Text>
			</View>
			<View
				ref={trackRef}
				style={styles.track}
				onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
				{...webProps}
			>
				<View style={[styles.fill, { width: `${pct}%` }]} />
				<View style={[styles.thumb, { left: `${pct}%` }]} />
			</View>
			<View style={styles.presetRow}>
				{[0.25, 0.5, 0.75, 1].map((v) => (
					<Pressable key={v} onPress={() => onChange(v)} style={styles.presetBtn}>
						<Text style={styles.presetText}>{Math.round(v * 100)}%</Text>
					</Pressable>
				))}
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	wrap: {
		gap: SPACING.sm,
		padding: SPACING.sm,
		borderRadius: 6,
		borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	title: {
		fontSize: 11, color: COLORS.text.secondary, fontWeight: '700',
		textTransform: 'uppercase', letterSpacing: 0.4,
	},

	swatchRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
	swatch: {
		width: 28, height: 28, borderRadius: 6,
		alignItems: 'center', justifyContent: 'center',
		borderWidth: 2, borderColor: 'transparent',
	},
	swatchActive: { borderColor: COLORS.text.primary },
	swatchMark: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 14 },

	sliderBlock: { gap: 4 },
	sliderHeader: { flexDirection: 'row', justifyContent: 'space-between' },
	sliderLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '600' },
	sliderValue: { fontSize: 11, color: COLORS.text.primary, fontWeight: '700' },

	track: {
		height: 18,
		borderRadius: 9,
		backgroundColor: COLORS.background.card,
		borderWidth: 1, borderColor: COLORS.border,
		position: 'relative',
		justifyContent: 'center',
		...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : null),
	},
	fill: {
		position: 'absolute', left: 0, top: 0, bottom: 0,
		backgroundColor: COLORS.primary,
		borderRadius: 9, opacity: 0.45,
	},
	thumb: {
		position: 'absolute', top: -3,
		width: 14, height: 24, marginLeft: -7,
		backgroundColor: COLORS.primary, borderRadius: 4,
		borderWidth: 1, borderColor: COLORS.text.inverse,
	},

	presetRow: { flexDirection: 'row', gap: 4 },
	presetBtn: {
		flex: 1,
		paddingVertical: 4,
		borderRadius: 4,
		borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.card,
		alignItems: 'center',
	},
	presetText: { fontSize: 10, color: COLORS.text.secondary, fontWeight: '600' },
});
