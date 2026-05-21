import { useState } from 'react';
import { VideoService } from '@/services/api/VideoService';
import { toast } from '@/shared/toast/Toast';
import { PickedFile } from '@/shared/utils/filePicker';
import { probeVideo, posterToPickedFile } from '@/shared/utils/videoProcessing';

export interface VideoUploadProgress { current: number; total: number; pct: number; }

export const useVideoUpload = () => {
	const [isUploading, setIsUploading] = useState(false);
	const [progress, setProgress] = useState<VideoUploadProgress>({ current: 0, total: 0, pct: 0 });

	const upload = async (files: PickedFile[]): Promise<number[]> => {
		if (files.length === 0) return [];
		setIsUploading(true);
		setProgress({ current: 0, total: files.length, pct: 0 });
		const svc = new VideoService();
		const ids: number[] = [];
		try {
			for (let i = 0; i < files.length; i++) {
				const f = files[i];
				const probe = await probeVideo(f);
				const poster = await posterToPickedFile(probe);
				const up = await svc.upload({
					file: f,
					poster,
					durationSeconds: probe.durationSeconds,
					width:  probe.width,
					height: probe.height,
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
