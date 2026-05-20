import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { videoApiBase, UserVideo } from '@/services/api/VideoService';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

interface Props {
	video: UserVideo;
	disabled?: boolean;
	onExtract: (videoId: number) => void;
}

function formatDuration(seconds: number | null): string {
	if (!seconds || seconds <= 0) return '—';
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Tuile vidéo dans le contexte studio annotateur.
 *
 * UX : single-click sur la tuile → ouvre l'extracteur de frames.
 * Différent de StudioFeedTile (double-clic) car l'extraction n'engage rien
 * d'irréversible — c'est juste une navigation vers l'écran d'extraction.
 * Le badge bleu « Extraire des frames » signale visuellement l'action.
 */
export function StudioVideoTile({ video, disabled, onExtract }: Props) {
	return (
		<Pressable
			onPress={() => { if (!disabled) onExtract(video.id); }}
			disabled={disabled}
			style={({ hovered }: any) => [
				styles.tile,
				disabled && styles.tileDisabled,
				hovered && !disabled && styles.tileHovered,
				Platform.OS === 'web' && !disabled && webCursor,
			]}
		>
			<View style={styles.posterWrap}>
				{video.has_poster ? (
					<AuthenticatedImage url={`${videoApiBase}/${video.id}/poster`} style={styles.poster} />
				) : (
					<View style={[styles.poster, styles.posterFallback]}>
						<Text style={styles.posterFallbackText}>🎬</Text>
					</View>
				)}
				<View style={styles.kindBadge}>
					<Text style={styles.kindBadgeText}>VIDÉO</Text>
				</View>
				<View style={styles.durationBadge}>
					<Text style={styles.durationText}>{formatDuration(video.duration_seconds)}</Text>
				</View>
			</View>
			<Text style={styles.name} numberOfLines={1}>{video.filename}</Text>
			<View style={styles.actionRow}>
				<Text style={styles.actionLabel}>📷 Extraire des frames</Text>
			</View>
		</Pressable>
	);
}

const webCursor = { cursor: 'pointer' } as any;

const styles = StyleSheet.create({
	tile: {
		width: 170,
		padding: SPACING.sm,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		backgroundColor: COLORS.background.card,
	},
	tileHovered: { backgroundColor: COLORS.background.main, borderColor: COLORS.primary },
	tileDisabled: { opacity: 0.5 },

	posterWrap: { position: 'relative', width: '100%', aspectRatio: 16 / 9, borderRadius: 6, overflow: 'hidden', backgroundColor: '#000' },
	poster: { width: '100%', height: '100%' },
	posterFallback: { justifyContent: 'center', alignItems: 'center' },
	posterFallbackText: { fontSize: 32, color: '#fff' },
	kindBadge: { position: 'absolute', top: 4, left: 4, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.65)' },
	kindBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
	durationBadge: { position: 'absolute', right: 4, bottom: 4, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.75)' },
	durationText: { color: '#fff', fontSize: 10, fontWeight: '600' },

	name: { ...TYPOGRAPHY.body, fontWeight: '600', marginTop: SPACING.sm },
	actionRow: { marginTop: SPACING.sm, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, backgroundColor: COLORS.primary, alignSelf: 'flex-start' },
	actionLabel: { fontSize: 11, color: COLORS.text.inverse, fontWeight: '700' },
});
