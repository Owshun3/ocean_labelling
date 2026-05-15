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
	actions_validated_total?: number;
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
		actions_validated_total?: number;
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

export type HealthStatus = 'ok' | 'down';

export interface HealthService {
	id: string;
	name: string;
	status: HealthStatus;
	latency_ms: number;
	detail: string | null;
}

export type AuditAction =
	| 'user.banned'
	| 'user.active_changed'
	| 'user.role_changed'
	| 'contestation.resolved'
	| 'setting.changed'
	| 'media.validated'
	| 'media.rejected'
	| 'media.auto_deleted';

export interface AuditEntry {
	id: number;
	actor: { id: number; username: string | null; role: string };
	action: AuditAction;
	target_type: string | null;
	target_id: number | null;
	payload: any;
	created_at: string;
}

export interface ActivityListResponse {
	results: AuditEntry[];
	total: number;
	limit: number;
	offset: number;
}

export interface HealthReport {
	checked_at: string;
	probe_duration_ms: number;
	services: HealthService[];
	storage: { postgres_db_bytes: number | null };
	process: { uptime_seconds: number; node_version: string; rss_bytes: number; heap_used_bytes: number };
	system: {
		mem_total_bytes: number | null;
		mem_available_bytes: number | null;
		loadavg_1m: number | null;
		loadavg_5m: number | null;
		loadavg_15m: number | null;
		cpu_count: number;
	};
	sessions: { active: number | null };
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

	async getHealth(): Promise<HealthReport> {
		const resp = await adminClient.get<HealthReport>('/health');
		return resp.data;
	}

	async listActivity(opts: { limit?: number; offset?: number; action?: AuditAction | ''; actor_id?: number | null } = {}): Promise<ActivityListResponse> {
		const params: Record<string, any> = {};
		if (opts.limit  !== undefined) params.limit  = opts.limit;
		if (opts.offset !== undefined) params.offset = opts.offset;
		if (opts.action)               params.action = opts.action;
		if (opts.actor_id != null)     params.actor_id = opts.actor_id;
		const resp = await adminClient.get<ActivityListResponse>('/activity', { params });
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
