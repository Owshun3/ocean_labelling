import axios from 'axios';
import { attachBanInterceptor } from './banInterceptor';
import { appendToFormData, PickedFile } from '@/shared/utils/filePicker';

import { APP_API_BASE } from './runtimeUrls';

export const videoApiBase = `${APP_API_BASE}/videos`;

const videoClient = axios.create({ baseURL: videoApiBase, withCredentials: true });
attachBanInterceptor(videoClient);

export type VideoModerationStatus = 'pending' | 'validated' | 'rejected';

export interface UserVideo {
	id: number;
	filename: string;
	content_type: string;
	size_bytes: number;
	duration_seconds: number | null;
	width: number | null;
	height: number | null;
	has_poster: boolean;
	uploaded_at: string;
	moderation_status: VideoModerationStatus | null;
	moderation_review_comment: string | null;
	moderation_reviewed_at: string | null;
	contestation_pending?: boolean;
}

export interface UploadVideoOptions {
	file: PickedFile;
	poster?: PickedFile | null;
	durationSeconds?: number | null;
	width?: number | null;
	height?: number | null;
	onProgress?: (pct: number) => void;
}

export interface UploadedVideo {
	id: number;
	filename: string;
	content_type: string;
	size_bytes: number;
	duration_seconds: number | null;
	width: number | null;
	height: number | null;
	has_poster: boolean;
}

export class VideoService {
	async list(): Promise<UserVideo[]> {
		const resp = await videoClient.get<{ results: UserVideo[] }>('/');
		return resp.data.results;
	}

	async get(id: number): Promise<UserVideo> {
		const resp = await videoClient.get<UserVideo>(`/${id}`);
		return resp.data;
	}

	async delete(id: number): Promise<void> {
		await videoClient.delete(`/${id}`);
	}

	async upload(opts: UploadVideoOptions): Promise<UploadedVideo> {
		const fd = new FormData();
		appendToFormData(fd, 'video', opts.file);
		if (opts.poster) appendToFormData(fd, 'poster', opts.poster, 'poster.jpg');
		fd.append('metadata', JSON.stringify({
			duration_seconds: opts.durationSeconds ?? null,
			width:  opts.width  ?? null,
			height: opts.height ?? null,
		}));
		const resp = await videoClient.post<UploadedVideo>('/', fd, {
			onUploadProgress: (e) => {
				if (e.total && opts.onProgress) opts.onProgress(Math.round((e.loaded / e.total) * 100));
			},
		});
		return resp.data;
	}

	streamUrl(id: number): string  { return `${videoApiBase}/${id}/stream`; }
	posterUrl(id: number): string  { return `${videoApiBase}/${id}/poster`; }
}
