import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { toast } from '@/shared/toast/Toast';
import { VideoService, UserVideo, videoApiBase } from '@/services/api/VideoService';
import { CvatMediaService } from '@/services/api/CvatMediaService';
import { AppApiService } from '@/services/api/AppApiService';
import { MediaMetadataService } from '@/services/api/MediaMetadataService';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

const FRAME_STEP_SECONDS = 1 / 30;
const SEEK_SETTLE_MS = 60;

interface ExtractedFrame {
	clientId: string;
	timeMs: number;
	blob: Blob;
	dataUrl: string;
}
interface Bookmark { id: string; timeMs: number; }

function fmtTime(ms: number): string {
	const m = Math.floor(ms / 60000);
	const s = Math.floor((ms % 60000) / 1000);
	const cs = Math.floor((ms % 1000) / 10);
	return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

async function captureFrame(video: HTMLVideoElement): Promise<{ blob: Blob | null; dataUrl: string | null }> {
	const c = document.createElement('canvas');
	c.width  = video.videoWidth;
	c.height = video.videoHeight;
	const ctx = c.getContext('2d');
	if (!ctx) return { blob: null, dataUrl: null };
	ctx.drawImage(video, 0, 0, c.width, c.height);
	const dataUrl = c.toDataURL('image/jpeg', 0.92);
	const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.92));
	return { blob, dataUrl };
}

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

interface Props { videoId: number; }

export const VideoExtractorScreen: React.FC<Props> = ({ videoId }) => {
	const router = useRouter();
	const svc = useRef(new VideoService()).current;
	const cvat = useRef(new CvatMediaService()).current;
	const app = useRef(new AppApiService()).current;
	const metaSvc = useRef(new MediaMetadataService()).current;

	const [video, setVideo] = useState<UserVideo | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [paused, setPaused] = useState(true);
	const [currentTimeMs, setCurrentTimeMs] = useState(0);
	const [durationMs, setDurationMs] = useState(0);
	const [frames, setFrames] = useState<ExtractedFrame[]>([]);
	const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [lastClicked, setLastClicked] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [batchExtracting, setBatchExtracting] = useState(false);
	const videoElRef = useRef<HTMLVideoElement | null>(null);

	useEffect(() => {
		(async () => {
			try {
				const v = await svc.get(videoId);
				setVideo(v);
			} catch (err: any) {
				setError(err?.response?.data?.error || err?.message || 'Vidéo introuvable.');
			} finally {
				setLoading(false);
			}
		})();
	}, [svc, videoId]);

	const orderedIds = useMemo(() => frames.map((f) => f.clientId), [frames]);

	const captureAtCurrentTime = useCallback(async (): Promise<ExtractedFrame | null> => {
		const v = videoElRef.current;
		if (!v) return null;
		const { blob, dataUrl } = await captureFrame(v);
		if (!blob || !dataUrl) return null;
		const timeMs = Math.round(v.currentTime * 1000);
		const clientId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
		return { clientId, timeMs, blob, dataUrl };
	}, []);

	const handleExtract = useCallback(async () => {
		const v = videoElRef.current;
		if (!v || !paused) return;
		const f = await captureAtCurrentTime();
		if (!f) { toast.error('Extraction de frame échouée.'); return; }
		setFrames((prev) => [...prev, f]);
		toast.success(`Frame extraite à ${fmtTime(f.timeMs)}`);
	}, [paused, captureAtCurrentTime]);

	const stepFrame = useCallback((direction: 1 | -1) => {
		const v = videoElRef.current;
		if (!v) return;
		if (!v.paused) v.pause();
		const next = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + direction * FRAME_STEP_SECONDS));
		v.currentTime = next;
	}, []);

	const addBookmark = useCallback(() => {
		const v = videoElRef.current;
		if (!v) return;
		const timeMs = Math.round(v.currentTime * 1000);
		const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
		setBookmarks((prev) => {
			if (prev.some((b) => Math.abs(b.timeMs - timeMs) < 50)) return prev;
			return [...prev, { id, timeMs }].sort((a, b) => a.timeMs - b.timeMs);
		});
		toast.success(`Bookmark à ${fmtTime(timeMs)}`);
	}, []);

	const removeBookmark = (id: string) => setBookmarks((prev) => prev.filter((b) => b.id !== id));

	const seekToMs = (ms: number) => {
		const v = videoElRef.current;
		if (!v) return;
		v.pause();
		v.currentTime = ms / 1000;
	};

	const extractAllBookmarks = async () => {
		const v = videoElRef.current;
		if (!v || bookmarks.length === 0 || batchExtracting) return;
		setBatchExtracting(true);
		v.pause();
		const captured: ExtractedFrame[] = [];
		try {
			for (const bm of bookmarks) {
				await new Promise<void>((resolve) => {
					const onSeeked = () => { v.removeEventListener('seeked', onSeeked); resolve(); };
					v.addEventListener('seeked', onSeeked);
					v.currentTime = bm.timeMs / 1000;
				});
				await new Promise((r) => setTimeout(r, SEEK_SETTLE_MS));
				const { blob, dataUrl } = await captureFrame(v);
				if (blob && dataUrl) {
					captured.push({
						clientId: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
						timeMs: bm.timeMs, blob, dataUrl,
					});
				}
			}
			setFrames((prev) => [...prev, ...captured]);
			setBookmarks([]);
			toast.success(`${captured.length} frame(s) extraite(s) depuis les bookmarks.`);
		} catch (err: any) {
			toast.error(err?.message || 'Extraction par lot échouée.');
		} finally {
			setBatchExtracting(false);
		}
	};

	const handleSelect = (clientId: string, evt: any) => {
		const native = evt?.nativeEvent || {};
		const shift = !!native.shiftKey;
		const ctrlOrMeta = !!native.ctrlKey || !!native.metaKey;
		if (shift && lastClicked !== null) {
			const a = orderedIds.indexOf(lastClicked);
			const b = orderedIds.indexOf(clientId);
			if (a >= 0 && b >= 0) {
				const [start, end] = a < b ? [a, b] : [b, a];
				setSelected(new Set(orderedIds.slice(start, end + 1)));
			}
			return;
		}
		if (ctrlOrMeta) {
			const next = new Set(selected);
			if (next.has(clientId)) next.delete(clientId); else next.add(clientId);
			setSelected(next);
			setLastClicked(clientId);
			return;
		}
		setSelected(new Set([clientId]));
		setLastClicked(clientId);
	};

	const handleDeleteSelected = () => {
		if (selected.size === 0) return;
		setFrames((prev) => prev.filter((f) => !selected.has(f.clientId)));
		setSelected(new Set());
	};

	const handleSaveSelected = async () => {
		if (selected.size === 0 || submitting || !video) return;
		const toSave = frames.filter((f) => selected.has(f.clientId));
		setSubmitting(true);
		try {
			const self = await cvat.getSelf();
			const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

			let saved = 0;
			for (const f of toSave) {
				const num = await cvat.getNextUploadNumber();
				const baseName = `${self.username}_${date}_${String(num).padStart(4, '0')}_frame`;
				const fileName = `${baseName}.jpg`;
				const file = new File([f.blob], fileName, { type: 'image/jpeg' });
				const asset = { file, uri: '', fileSize: file.size, mimeType: 'image/jpeg' };

				const taskId = await cvat.uploadMedia(baseName, [asset]);
				await cvat.waitForTaskData(taskId);
				try { await app.recordUpload(taskId, baseName, 1); }
				catch (err) { console.warn('[extract] recordUpload failed', err); }
				try {
					await metaSvc.set(taskId, {
						gps_latitude:  null, gps_longitude: null,
						taken_at:      null,
						camera_make:   null, camera_model: null,
						image_width:   video.width  ?? null,
						image_height:  video.height ?? null,
						raw_exif:      null,
						source_video_id:      videoId,
						source_frame_time_ms: f.timeMs,
					});
				} catch (err) { console.warn('[extract] metadata failed', err); }
				saved += 1;
			}

			toast.success(saved === 1
				? 'Frame sauvegardée et soumise à la modération.'
				: `${saved} frames sauvegardées et soumises à la modération.`);
			setFrames((prev) => prev.filter((f) => !selected.has(f.clientId)));
			setSelected(new Set());
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Sauvegarde échouée.');
		} finally {
			setSubmitting(false);
		}
	};

	// Keyboard shortcuts (web only). Capture phase pour passer avant les bindings
	// internes du <video controls> (qui mange certaines touches dont B sur Chrome).
	useEffect(() => {
		if (Platform.OS !== 'web') return;
		const onKey = (e: KeyboardEvent) => {
			if (isTypingTarget(e.target)) return;
			const k = e.key;
			if (k === 'ArrowLeft')  { e.preventDefault(); e.stopPropagation(); stepFrame(-1); return; }
			if (k === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); stepFrame(1);  return; }
			if (k === 'b' || k === 'B') { e.preventDefault(); e.stopPropagation(); addBookmark(); return; }
			if (k === 'e' || k === 'E') {
				e.preventDefault(); e.stopPropagation();
				if (paused) handleExtract();
				return;
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [stepFrame, addBookmark, handleExtract, paused]);

	if (loading) return <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>;
	if (error || !video) return (
		<View style={styles.center}>
			<Text style={styles.errorText}>{error || 'Vidéo introuvable.'}</Text>
			<Pressable
				onPress={() => router.replace('/(main)/studio/select' as Href)}
				style={styles.backBtn}
			>
				<Text style={styles.backBtnText}>Retour</Text>
			</Pressable>
		</View>
	);

	if (Platform.OS !== 'web') return (
		<View style={styles.center}><Text style={styles.errorText}>L'extracteur de frames est disponible sur le web uniquement.</Text></View>
	);

	const src = `${videoApiBase}/${videoId}/stream`;
	const totalMs = durationMs || (video.duration_seconds ? Math.round(video.duration_seconds * 1000) : 0);

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Pressable
					onPress={() => router.replace('/(main)/studio/select' as Href)}
					style={styles.backBtn}
				>
					<Text style={styles.backBtnText}>← Retour</Text>
				</Pressable>
				<Text style={styles.title} numberOfLines={1}>Extraire des frames — {video.filename}</Text>
			</View>

			<View style={styles.main}>
				<View style={styles.playerCol}>
					{/* @ts-ignore RN-web supports raw HTML */}
					<video
						ref={(el: any) => { videoElRef.current = el; }}
						src={src}
						controls
						crossOrigin="use-credentials"
						controlsList="nodownload"
						onContextMenu={(e: any) => e.preventDefault()}
						onPause={() => setPaused(true)}
						onPlay={() => setPaused(false)}
						onLoadedMetadata={(e: any) => setDurationMs(Math.round((e.target?.duration || 0) * 1000))}
						onTimeUpdate={(e: any) => setCurrentTimeMs(Math.round((e.target?.currentTime || 0) * 1000))}
						style={{ width: '100%', maxHeight: '65vh', background: '#000' }}
					/>

					<MarkerBar
						durationMs={totalMs}
						currentTimeMs={currentTimeMs}
						frames={frames}
						bookmarks={bookmarks}
						onSeek={seekToMs}
					/>

					<View style={styles.actionRow}>
						<Pressable
							onPress={handleExtract}
							disabled={!paused || batchExtracting}
							style={[styles.extractBtn, (!paused || batchExtracting) && styles.btnDisabled]}
						>
							<Text style={styles.extractBtnText}>📸 Extraire la frame courante</Text>
						</Pressable>
						<Pressable onPress={() => stepFrame(-1)} style={styles.stepBtn}>
							<Text style={styles.stepBtnText}>← frame (1/30 s)</Text>
						</Pressable>
						<Pressable onPress={() => stepFrame(1)} style={styles.stepBtn}>
							<Text style={styles.stepBtnText}>frame → (1/30 s)</Text>
						</Pressable>
						<Pressable onPress={addBookmark} style={styles.bookmarkBtn}>
							<Text style={styles.bookmarkBtnText}>★ Marquer (B)</Text>
						</Pressable>
					</View>

					<View style={styles.hintBox}>
						<Text style={styles.hintTitle}>Raccourcis clavier</Text>
						<Text style={styles.hintLine}>← / → : avance/recule d'une frame (~1/30 s, force la pause)</Text>
						<Text style={styles.hintLine}>B : pose un marqueur (lecture ou pause) — extraction par lot ensuite</Text>
						<Text style={styles.hintLine}>E : extrait la frame courante (uniquement en pause)</Text>
					</View>

					{bookmarks.length > 0 ? (
						<View style={styles.bookmarksBox}>
							<View style={styles.bookmarksHeader}>
								<Text style={styles.bookmarksTitle}>Marqueurs en attente</Text>
								<Pressable
									onPress={extractAllBookmarks}
									disabled={batchExtracting}
									style={[styles.batchBtn, batchExtracting && styles.btnDisabled]}
								>
									<Text style={styles.batchBtnText}>{batchExtracting ? 'Extraction…' : `Extraire les ${bookmarks.length} marqueurs`}</Text>
								</Pressable>
							</View>
							<View style={styles.bookmarkChips}>
								{bookmarks.map((b) => (
									<Pressable
										key={b.id}
										onPress={() => seekToMs(b.timeMs)}
										style={styles.bookmarkChip}
									>
										<Text style={styles.bookmarkChipText}>{fmtTime(b.timeMs)}</Text>
										<Pressable onPress={() => removeBookmark(b.id)} hitSlop={8} style={styles.bookmarkChipClose}>
											<Text style={styles.bookmarkChipCloseText}>✕</Text>
										</Pressable>
									</Pressable>
								))}
							</View>
						</View>
					) : null}
				</View>

				<View style={styles.stripCol}>
					<View style={styles.stripHeader}>
						<Text style={styles.stripTitle}>Frames extraites</Text>
						<Text style={styles.stripCount}>{frames.length}</Text>
					</View>
					<View style={styles.stripToolbar}>
						<Pressable
							onPress={handleDeleteSelected}
							disabled={selected.size === 0 || submitting}
							style={[styles.actionBtn, styles.deleteBtn, (selected.size === 0 || submitting) && styles.btnDisabled]}
						>
							<Text style={styles.actionBtnText}>Supprimer ({selected.size})</Text>
						</Pressable>
						<Pressable
							onPress={handleSaveSelected}
							disabled={selected.size === 0 || submitting}
							style={[styles.actionBtn, styles.saveBtn, (selected.size === 0 || submitting) && styles.btnDisabled]}
						>
							<Text style={styles.actionBtnText}>{submitting ? 'Envoi…' : `Sauvegarder (${selected.size})`}</Text>
						</Pressable>
					</View>
					<ScrollView contentContainerStyle={styles.stripGrid}>
						{frames.length === 0 ? (
							<Text style={styles.emptyText}>Aucune frame extraite pour l'instant.</Text>
						) : frames.map((f) => {
							const isSel = selected.has(f.clientId);
							return (
								<Pressable
									key={f.clientId}
									onPress={(e) => handleSelect(f.clientId, e)}
									style={[styles.frameTile, isSel && styles.frameTileSelected]}
								>
									{/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
									<img src={f.dataUrl} style={{ width: '100%', display: 'block', borderRadius: 4 }} />
									<Text style={styles.frameTime}>{fmtTime(f.timeMs)}</Text>
								</Pressable>
							);
						})}
					</ScrollView>
				</View>
			</View>
		</View>
	);
};

const MarkerBar: React.FC<{
	durationMs: number;
	currentTimeMs: number;
	frames: ExtractedFrame[];
	bookmarks: Bookmark[];
	onSeek: (ms: number) => void;
}> = ({ durationMs, currentTimeMs, frames, bookmarks, onSeek }) => {
	if (durationMs <= 0) return null;
	const pct = (ms: number) => Math.min(100, Math.max(0, (ms / durationMs) * 100));
	return (
		<View style={markerStyles.wrap}>
			<View style={markerStyles.track}>
				<View style={[markerStyles.progress, { width: `${pct(currentTimeMs)}%` }]} />
				{frames.map((f) => (
					<Pressable
						key={`m-${f.clientId}`}
						onPress={() => onSeek(f.timeMs)}
						style={[markerStyles.tickWrap, { left: `${pct(f.timeMs)}%` }]}
					>
						<View style={[markerStyles.tick, markerStyles.tickFrame]} />
					</Pressable>
				))}
				{bookmarks.map((b) => (
					<Pressable
						key={`m-${b.id}`}
						onPress={() => onSeek(b.timeMs)}
						style={[markerStyles.tickWrap, { left: `${pct(b.timeMs)}%` }]}
					>
						<View style={[markerStyles.tick, markerStyles.tickBookmark]} />
					</Pressable>
				))}
			</View>
			<View style={markerStyles.legend}>
				<View style={markerStyles.legendItem}>
					<View style={[markerStyles.dot, markerStyles.tickFrame]} />
					<Text style={markerStyles.legendText}>Frames extraites ({frames.length})</Text>
				</View>
				<View style={markerStyles.legendItem}>
					<View style={[markerStyles.dot, markerStyles.tickBookmark]} />
					<Text style={markerStyles.legendText}>Marqueurs ({bookmarks.length})</Text>
				</View>
			</View>
		</View>
	);
};

const markerStyles = StyleSheet.create({
	wrap: { marginTop: SPACING.xs, gap: 4 },
	track: { position: 'relative', height: 18, backgroundColor: COLORS.background.main, borderRadius: 4, borderWidth: 1, borderColor: COLORS.border },
	progress: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: COLORS.primary, opacity: 0.18, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
	tickWrap: { position: 'absolute', top: -2, bottom: -2, width: 4, marginLeft: -2 } as any,
	tick: { flex: 1, width: 4, borderRadius: 2 },
	tickFrame: { backgroundColor: COLORS.danger },
	tickBookmark: { backgroundColor: COLORS.warning },
	legend: { flexDirection: 'row', gap: SPACING.md },
	legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
	dot: { width: 10, height: 10, borderRadius: 2 },
	legendText: { fontSize: 11, color: COLORS.text.secondary },
});

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg },
	center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.md },

	header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
	backBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.background.card, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border },
	backBtnText: { ...TYPOGRAPHY.body, color: COLORS.text.primary, fontWeight: '600' },
	title: { ...TYPOGRAPHY.h2, fontSize: 16, flex: 1 },

	main: { flex: 1, flexDirection: 'row', gap: SPACING.lg },
	playerCol: { flex: 1 },
	stripCol: { width: 320, backgroundColor: COLORS.background.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.sm },

	actionRow: { marginTop: SPACING.md, flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
	extractBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, backgroundColor: COLORS.primary },
	extractBtnText: { color: COLORS.text.inverse, fontWeight: '600' },
	stepBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border },
	stepBtnText: { color: COLORS.text.primary, fontWeight: '600' },
	bookmarkBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, backgroundColor: COLORS.warning },
	bookmarkBtnText: { color: COLORS.text.inverse, fontWeight: '600' },

	hintBox: { marginTop: SPACING.sm, padding: SPACING.sm, backgroundColor: COLORS.background.card, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border },
	hintTitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontWeight: '700', marginBottom: 2 },
	hintLine: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },

	bookmarksBox: { marginTop: SPACING.sm, padding: SPACING.sm, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
	bookmarksHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
	bookmarksTitle: { ...TYPOGRAPHY.h2, fontSize: 14 },
	batchBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: 6, backgroundColor: COLORS.success },
	batchBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 12 },
	bookmarkChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
	bookmarkChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.sm, paddingVertical: 4, backgroundColor: COLORS.background.main, borderRadius: 999, borderWidth: 1, borderColor: COLORS.warning },
	bookmarkChipText: { fontSize: 11, color: COLORS.text.primary, fontWeight: '600', fontVariant: ['tabular-nums'] },
	bookmarkChipClose: { width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.background.card, alignItems: 'center', justifyContent: 'center' },
	bookmarkChipCloseText: { fontSize: 10, color: COLORS.text.primary, fontWeight: '700' },

	stripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xs, paddingBottom: SPACING.xs, borderBottomWidth: 1, borderBottomColor: COLORS.border },
	stripTitle: { ...TYPOGRAPHY.h2, fontSize: 14 },
	stripCount: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontWeight: '700' },
	stripToolbar: { flexDirection: 'row', gap: SPACING.xs, paddingVertical: SPACING.sm },
	actionBtn: { flex: 1, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: 6, alignItems: 'center' },
	deleteBtn: { backgroundColor: COLORS.danger },
	saveBtn: { backgroundColor: COLORS.success },
	btnDisabled: { opacity: 0.4 },
	actionBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 12 },

	stripGrid: { gap: SPACING.sm },
	emptyText: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic', textAlign: 'center', padding: SPACING.lg },
	frameTile: { padding: SPACING.xs, borderRadius: 6, borderWidth: 2, borderColor: 'transparent', backgroundColor: COLORS.background.main, marginBottom: SPACING.xs },
	frameTileSelected: { borderColor: COLORS.primary },
	frameTime: { ...TYPOGRAPHY.caption, color: COLORS.text.primary, textAlign: 'center', fontVariant: ['tabular-nums'] },

	errorText: { ...TYPOGRAPHY.body, color: COLORS.danger, textAlign: 'center' },
});
