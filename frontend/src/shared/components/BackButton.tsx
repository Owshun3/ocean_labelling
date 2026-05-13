import React from 'react';
import { Pressable, Text, StyleSheet, Platform } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { COLORS } from '@/shared/theme/colors';

interface Props {
	href?: Href;
	label?: string;
}

export const BackButton: React.FC<Props> = ({ href, label = '← Retour' }) => {
	const router = useRouter();
	const handlePress = () => {
		if (href) router.push(href);
		else router.back();
	};
	return (
		<Pressable
			onPress={handlePress}
			style={({ hovered }: any) => [styles.btn, Platform.OS === 'web' && hovered && styles.btnHovered]}
		>
			<Text style={styles.text}>{label}</Text>
		</Pressable>
	);
};

const styles = StyleSheet.create({
	btn: {
		alignSelf: 'flex-start',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: COLORS.border,
		backgroundColor: COLORS.background.card,
	},
	btnHovered: { backgroundColor: COLORS.background.main },
	text: { fontSize: 13, color: COLORS.text.primary, fontWeight: '600' },
});
