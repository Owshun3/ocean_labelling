import { useState } from 'react';
import { Platform } from 'react-native';
import { VideoService } from '@/services/api/VideoService';
import { toast } from '@/shared/toast/Toast';

const POSTER_TIME_SECONDS = 1.0;
const POSTER_MAX_WIDTH    = 480;

async function probeAndPoster(file: File): Promise<{
	durationSeconds: number | null;
	width: number | null;
	height: number | null;
	poster: Blob | null;
}> {
	if (Platform.OS !== 'web') return { durationSeconds: null, width: null, height: null, poster: null };

	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const v = document.createElement('video');
		v.preload = 'auto';
		v.muted = true;
		v.playsInline = true;
		v.src = url;

		const cleanup = () => URL.revokeObjectURL(url);
		const done = (out: any) => { cleanup(); resolve(out); };

		v.addEventListener('loadedmetadata', () => {
			const duration = isFinite(v.duration) ? v.duration : null;
			const width    = v.videoWidth || null;
			const height   = v.videoHeight || null;
			const seekTo   = duration && duration > 0 ? Math.min(POSTER_TIME_SECONDS, duration / 2) : 0;
			v.currentTime = seekTo;

			v.addEventListener('seeked', () => {
				try {
					const scale = width && width > POSTER_MAX_WIDTH ? POSTER_MAX_WIDTH / width : 1;
					const cw = Math.max(1, Math.round((width || 1) * scale));
					const ch = Math.max(1, Math.round((height || 1) * scale));
					const c = document.createElement('canvas');
					c.width = cw; c.height = ch;
					const ctx = c.getContext('2d');
					if (!ctx) return done({ durationSeconds: duration, width, height, poster: null });
					ctx.drawImage(v, 0, 0, cw, ch);
					c.toBlob((blob) => {
						done({ durationSeconds: duration, width, height, poster: blob || null });
					}, 'image/jpeg', 0.85);
				} catch {
					done({ durationSeconds: duration, width, height, poster: null });
				}
			}, { once: true });
		}, { once: true });

		v.addEventListener('error', () => done({ durationSeconds: null, width: null, height: null, poster: null }), { once: true });
	});
}

export interface VideoUploadProgress { current: number; total: number; pct: number; }

export const useVideoUpload = () => {
	const [isUploading, setIsUploading] = useState(false);
	const [progress, setProgress] = useState<VideoUploadProgress>({ current: 0, total: 0, pct: 0 });

	const upload = async (files: File[]): Promise<number[]> => {
		if (files.length === 0) return [];
		setIsUploading(true);
		setProgress({ current: 0, total: files.length, pct: 0 });
		const svc = new VideoService();
		const ids: number[] = [];
		try {
			for (let i = 0; i < files.length; i++) {
				const f = files[i];
				const meta = await probeAndPoster(f);
				const up = await svc.upload({
					file: f,
					poster: meta.poster,
					durationSeconds: meta.durationSeconds,
					width:  meta.width,
					height: meta.height,
					onProgress: (pct) => setProgress({ current: i, total: files.length, pct }),
				});
				ids.push(up.id);
				setProgress({ current: i + 1, total: files.length, pct: 100 });
			}
			return ids;
		} catch (err: any) {
			const message = err?.response?.data?.error || err?.message || 'Téléversement vidéo échoué.';
			toast.error(message);
			throw err;
		} finally {
			setIsUploading(false);
		}
	};

	return { upload, isUploading, progress };
};
