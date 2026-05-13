import axios from 'axios';
import { attachBanInterceptor } from './banInterceptor';

const APP_API_BASE = process.env.EXPO_PUBLIC_APP_API_URL || 'http://localhost:8888/app-api';

const mediaClient = axios.create({ baseURL: `${APP_API_BASE}/media`, withCredentials: true });

attachBanInterceptor(mediaClient);

export interface MediaMetadata {
	cvat_task_id:  number;
	gps_latitude:  number | null;
	gps_longitude: number | null;
	taken_at:      string | null;
	camera_make:   string | null;
	camera_model:  string | null;
	image_width:   number | null;
	image_height:  number | null;
	created_at?:   string;
}

export interface MetadataInput {
	gps_latitude?:  number | null;
	gps_longitude?: number | null;
	taken_at?:      string | null;
	camera_make?:   string | null;
	camera_model?:  string | null;
	image_width?:   number | null;
	image_height?:  number | null;
	raw_exif?:      Record<string, unknown> | null;
}

export class MediaMetadataService {
	async get(taskId: number): Promise<MediaMetadata | null> {
		try {
			const resp = await mediaClient.get<MediaMetadata>(`/${taskId}/metadata`);
			return resp.data;
		} catch (err: any) {
			if (err?.response?.status === 404) return null;
			throw err;
		}
	}

	async set(taskId: number, input: MetadataInput): Promise<MediaMetadata> {
		const resp = await mediaClient.post<MediaMetadata>(`/${taskId}/metadata`, input);
		return resp.data;
	}
}
