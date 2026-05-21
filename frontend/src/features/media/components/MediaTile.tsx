import React from 'react';
import { View, Text, Pressable, StyleSheet, GestureResponderEvent } from 'react-native';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { videoApiBase } from '@/services/api/VideoService';
import { formatVideoDuration } from '@/shared/utils/formatters';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

export type MediaKind = 'image' | 'video';

interface BaseMediaItem {
	kind: MediaKind;
	id: number;
	name: string;
	statusComment: string | null;
}

interface ImageMedia extends BaseMediaItem {
	kind: 'image';
}

interface VideoMedia extends BaseMediaItem {
	kind: 'video';
	hasPoster: boolean;
	durationSeconds: number | null;
}

export type MediaItem = ImageMedia | VideoMedia;

interface Props {
	item: MediaItem;
	selected: boolean;
	onPress: (e: GestureResponderEvent) => void;
	onPlayVideo?: (videoId: number) => void;
}

export function MediaTile({ item, selected, onPress, onPlayVideo }: Props) {
	return (
		<Pressable onPress={onPress} style={[styles.tile, selected && styles.tileSelected]}>
			{item.kind === 'image' ? (
				<AuthenticatedImage url={`/tasks/${item.id}/preview`} style={styles.preview} />
			) : (
				<View style={styles.posterWrap}>
					{item.hasPoster ? (
						<AuthenticatedImage url={`${videoApiBase}/${item.id}/poster`} style={styles.poster} />
					) : (
						<View style={[styles.poster, styles.posterFallback]}>
							<Text style={styles.posterFallbackText}>🎬</Text>
						</View>
					)}
					{onPlayVideo ? (
						<Pressable
							onPress={(e) => { e.stopPropagation(); onPlayVideo(item.id); }}
							hitSlop={8}
							style={styles.playOverlay}
						>
							<View style={styles.playButton}>
								<Text style={styles.playButtonText}>▶</Text>
							</View>
						</Pressable>
					) : null}
					<View style={styles.durationBadge}>
						<Text style={styles.durationText}>{formatVideoDuration(item.durationSeconds)}</Text>
					</View>
					<View style={styles.kindBadge}>
						<Text style={styles.kindBadgeText}>VIDÉO</Text>
					</View>
				</View>
			)}
			<Text style={styles.name} numberOfLines={1}>{item.name}</Text>
			{item.statusComment ? (
				<Text style={styles.comment} numberOfLines={2}>{item.statusComment}</Text>
			) : null}
		</Pressable>
	);
}

const TILE_WIDTH = 140;

const styles = StyleSheet.create({
	tile: {
		width: TILE_WIDTH,
		padding: SPACING.xs,
		borderRadius: 8,
		borderWidth: 2,
		borderColor: 'transparent',
		backgroundColor: COLORS.background.main,
	},
	tileSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.background.card },

	preview: { width: '100%', aspectRatio: 1, borderRadius: 4 },

	posterWrap: { position: 'relative', width: '100%', aspectRatio: 16 / 9, borderRadius: 4, overflow: 'hidden', backgroundColor: '#000' },
	poster: { width: '100%', height: '100%' },
	posterFallback: { justifyContent: 'center', alignItems: 'center' },
	posterFallbackText: { fontSize: 28, color: '#fff' },
	playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
	playButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
	playButtonText: { color: '#fff', fontSize: 16, marginLeft: 2 },
	durationBadge: { position: 'absolute', right: 4, bottom: 4, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.75)' },
	durationText: { color: '#fff', fontSize: 10, fontWeight: '600' },
	kindBadge: { position: 'absolute', left: 4, top: 4, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.65)' },
	kindBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

	name: { fontSize: 12, fontWeight: '600', color: COLORS.text.primary, marginTop: 4 },
	comment: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic', marginTop: 2 },
});
