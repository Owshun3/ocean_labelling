import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { videoApiBase } from '@/services/api/VideoService';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

interface Props {
	videoId: number | null;
	onClose: () => void;
}

/**
 * Modal lecteur vidéo authentifié.
 * - `videoId === null` → ne rend rien (le composant peut être monté en permanence).
 * - Bloque le téléchargement direct (`controlsList="nodownload"` + clic droit).
 * - Web only (lecteur HTML5 natif).
 */
export const VideoPreviewModal: React.FC<Props> = ({ videoId, onClose }) => {
	if (videoId === null) return null;
	const streamUrl = `${videoApiBase}/${videoId}/stream`;

	return (
		<Modal visible animationType="fade" transparent onRequestClose={onClose}>
			<View style={styles.backdrop}>
				<View style={styles.card}>
					<View style={styles.header}>
						<Text style={styles.title}>Aperçu vidéo</Text>
						<Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
							<Text style={styles.closeText}>✕</Text>
						</Pressable>
					</View>
					{Platform.OS === 'web' ? (
						<div style={webPlayerWrap}>
							{/* @ts-ignore HTML natif sur RN Web */}
							<video
								src={streamUrl}
								controls
								crossOrigin="use-credentials"
								controlsList="nodownload"
								onContextMenu={(e: any) => e.preventDefault()}
								style={webPlayer}
							/>
						</div>
					) : (
						<Text style={styles.notWeb}>Aperçu vidéo : web uniquement.</Text>
					)}
				</View>
			</View>
		</Modal>
	);
};

const webPlayerWrap = { width: '100%', maxHeight: '70vh', display: 'flex', justifyContent: 'center' } as any;
const webPlayer    = { maxWidth: '100%', maxHeight: '70vh', background: '#000' } as any;

const styles = StyleSheet.create({
	backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
	card: {
		width: '95%', maxWidth: 1200,
		backgroundColor: COLORS.background.card,
		borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
		overflow: 'hidden',
	},
	header: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
	title: { ...TYPOGRAPHY.h2, fontSize: 16, flex: 1 },
	closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.background.main, alignItems: 'center', justifyContent: 'center' },
	closeText: { color: COLORS.text.primary, fontSize: 14, fontWeight: '700' },
	notWeb: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, padding: SPACING.lg, textAlign: 'center' },
});
