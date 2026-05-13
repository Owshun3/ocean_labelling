import axios from 'axios';
import { attachBanInterceptor } from './banInterceptor';

const APP_API_BASE = process.env.EXPO_PUBLIC_APP_API_URL || 'http://localhost:8888/app-api';

const adminClient = axios.create({ baseURL: `${APP_API_BASE}/admin`, withCredentials: true });
attachBanInterceptor(adminClient);

export interface DashboardSummary {
	contestations: { media: number; annotation: number; total: number };
	curation: { media_awaiting: number };
	accounts: { active_sessions: number; active_bans: number };
	species: { pending: number };
	settings: { upload_max_bytes: number | null };
}

export interface ContestationUploaderEntry {
	uploader_id: number;
	username: string | null;
	role: string;
	contestation_count: number;
	oldest_contestation: string;
	newest_contestation: string;
}

export interface ContestationModerator {
	id: number;
	username: string | null;
	role: string;
}

export interface ContestationItem {
	contestation_id: number;
	cvat_task_id: number;
	contested_at: string;
	rejected_at: string | null;
	rejection_reason: string | null;
	task: any | null;
	moderator: ContestationModerator | null;
}

export interface ContestationLot {
	message: string | null;
	first_contested_at: string;
	last_contested_at: string;
	items: ContestationItem[];
}

export interface ContestationUploaderDetail {
	uploader: {
		id: number;
		username: string | null;
		email: string | null;
		is_active: boolean | null;
		role: string;
	};
	lots: ContestationLot[];
}

export type ContestationAction = 'overturned' | 'upheld';

export type SettingType = 'string' | 'int' | 'bool';

export interface SettingItem {
	key: string;
	value: string | number | boolean;
	raw_value: string;
	type: SettingType;
	label: string;
	description: string;
	group_name: string;
	group_label: string;
	is_public: boolean;
	known: boolean;
}

export interface SettingsListResponse {
	groups: Record<string, string>;
	items: SettingItem[];
}

export class AdminService {
	async getDashboardSummary(): Promise<DashboardSummary> {
		const resp = await adminClient.get<DashboardSummary>('/dashboard/summary');
		return resp.data;
	}

	async listContestationUploaders(): Promise<ContestationUploaderEntry[]> {
		const resp = await adminClient.get<{ results: ContestationUploaderEntry[] }>('/contestations/uploaders');
		return resp.data.results;
	}

	async getContestationsForUploader(userId: number): Promise<ContestationUploaderDetail> {
		const resp = await adminClient.get<ContestationUploaderDetail>(`/contestations/uploaders/${userId}`);
		return resp.data;
	}

	async resolveContestations(ids: number[], action: ContestationAction): Promise<{ resolved: number; cvat_delete_errors?: any[] }> {
		const resp = await adminClient.post<{ resolved: number; cvat_delete_errors?: any[] }>(
			'/contestations/resolve',
			{ contestation_ids: ids, action },
		);
		return resp.data;
	}

	async listSettings(): Promise<SettingsListResponse> {
		const resp = await adminClient.get<SettingsListResponse>('/settings');
		return resp.data;
	}

	async updateSetting(key: string, value: string | number | boolean): Promise<{ key: string; value: any }> {
		const resp = await adminClient.patch<{ key: string; value: any }>(
			`/settings/${encodeURIComponent(key)}`,
			{ value },
		);
		return resp.data;
	}
}
