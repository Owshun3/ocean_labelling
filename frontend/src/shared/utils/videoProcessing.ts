import { Platform } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { PickedFile } from './filePicker';
import { uriToPickedFile } from './imageProcessing';

export interface VideoProbe {
	durationSeconds: number | null;
	width: number | null;
	height: number | null;
	posterUri: string | null;
	posterName: string | null;
	posterMime: string;
}

// Sur mobile, expo-video-thumbnails ne donne ni durée ni dimensions — le
// backend les accepte null. Poster toujours JPEG q=0.85.
export async function probeVideo(file: PickedFile, posterTimeSeconds = 1.0, posterMaxWidth = 480): Promise<VideoProbe> {
	if (Platform.OS === 'web') {
		return probeVideoWeb(file, posterTimeSeconds, posterMaxWidth);
	}
	return probeVideoNative(file, posterTimeSeconds);
}

async function probeVideoWeb(file: PickedFile, posterTimeSeconds: number, posterMaxWidth: number): Promise<VideoProbe> {
	if (typeof document === 'undefined' || typeof URL === 'undefined') {
		return { durationSeconds: null, width: null, height: null, posterUri: null, posterName: null, posterMime: 'image/jpeg' };
	}
	return new Promise<VideoProbe>((resolve) => {
		const v = document.createElement('video');
		v.preload = 'auto';
		v.muted = true;
		v.playsInline = true;
		v.src = file.uri;

		const done = (out: VideoProbe) => resolve(out);

		v.addEventListener('loadedmetadata', () => {
			const duration = isFinite(v.duration) ? v.duration : null;
			const width    = v.videoWidth || null;
			const height   = v.videoHeight || null;
			const seekTo   = duration && duration > 0 ? Math.min(posterTimeSeconds, duration / 2) : 0;
			v.currentTime = seekTo;

			v.addEventListener('seeked', () => {
				try {
					const scale = width && width > posterMaxWidth ? posterMaxWidth / width : 1;
					const cw = Math.max(1, Math.round((width || 1) * scale));
					const ch = Math.max(1, Math.round((height || 1) * scale));
					const c = document.createElement('canvas');
					c.width = cw; c.height = ch;
					const ctx = c.getContext('2d');
					if (!ctx) return done({ durationSeconds: duration, width, height, posterUri: null, posterName: null, posterMime: 'image/jpeg' });
					ctx.drawImage(v, 0, 0, cw, ch);
					c.toBlob((blob) => {
						if (!blob) return done({ durationSeconds: duration, width, height, posterUri: null, posterName: null, posterMime: 'image/jpeg' });
						const posterUri = URL.createObjectURL(blob);
						const posterName = (file.name || 'video').replace(/\.[^.]+$/, '') + '_poster.jpg';
						done({ durationSeconds: duration, width, height, posterUri, posterName, posterMime: 'image/jpeg' });
					}, 'image/jpeg', 0.85);
				} catch {
					done({ durationSeconds: duration, width, height, posterUri: null, posterName: null, posterMime: 'image/jpeg' });
				}
			}, { once: true });
		}, { once: true });

		v.addEventListener('error', () => done({ durationSeconds: null, width: null, height: null, posterUri: null, posterName: null, posterMime: 'image/jpeg' }), { once: true });
	});
}

async function probeVideoNative(file: PickedFile, posterTimeSeconds: number): Promise<VideoProbe> {
	try {
		const { uri } = await VideoThumbnails.getThumbnailAsync(file.uri, {
			time: Math.max(0, posterTimeSeconds * 1000),
			quality: 0.85,
		});
		const posterName = (file.name || 'video').replace(/\.[^.]+$/, '') + '_poster.jpg';
		return { durationSeconds: null, width: null, height: null, posterUri: uri, posterName, posterMime: 'image/jpeg' };
	} catch {
		return { durationSeconds: null, width: null, height: null, posterUri: null, posterName: null, posterMime: 'image/jpeg' };
	}
}

export async function posterToPickedFile(probe: VideoProbe): Promise<PickedFile | null> {
	if (!probe.posterUri || !probe.posterName) return null;
	return uriToPickedFile(probe.posterUri, probe.posterName, probe.posterMime);
}
