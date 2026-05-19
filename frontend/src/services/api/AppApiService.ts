import axios from 'axios';
import { attachBanInterceptor } from './banInterceptor';

import { APP_API_BASE } from './runtimeUrls';

export const appApiClient = axios.create({ baseURL: APP_API_BASE, withCredentials: true });

attachBanInterceptor(appApiClient);

export type AppRole = 'admin' | 'moderator' | 'curator' | 'chercheur' | 'annotator' | 'guest';
export type AccountState = 'active' | 'disabled' | 'banned';
export type ModerationStatus = 'pending' | 'validated' | 'rejected';

export type MediaKind = 'image' | 'video';

export interface ModerationStatusEntry {
	media_kind: MediaKind;
	cvat_task_id: number | null;
	video_id: number | null;
	status: ModerationStatus;
	review_comment: string | null;
	reviewed_at: string | null;
}

export interface ContestItem { kind: MediaKind; id: number; }

export interface UserProfileStats {
	annotations_validated:   number;
	media_validated:         number;
	media_rejected:          number;
	media_uploaded_total:    number;
	actions_validated_total: number;
}

export interface UserProfile {
	id: number;
	username: string;
	first_name: string;
	last_name: string;
	email: string;
	date_joined: string | null;
	is_superuser: boolean;
	role: AppRole;
	username_changed_at: string | null;
	username_next_change_at: string | null;
	stats: UserProfileStats;
}

export interface UpdateProfilePayload {
	first_name?: string;
	last_name?: string;
	email?: string;
	username?: string;
}

export interface ChangePasswordPayload {
	old_password: string;
	new_password: string;
	confirm_password: string;
}

export interface BanInfo {
	reason: string | null;
	expires_at: string | null;
	banned_at: string | null;
}

export interface UserWithRole {
	id: number;
	username: string;
	email: string;
	first_name: string;
	last_name: string;
	is_superuser: boolean;
	is_active: boolean;
	date_joined: string | null;
	role: AppRole;
	state: AccountState;
	ban: BanInfo | null;
	actions_validated_total: number;
	active_sessions?: number;
	last_seen_at?: string | null;
}

export class AppApiService {
	async getMyRole(): Promise<{ id: number; role: AppRole }> {
		const resp = await appApiClient.get<{ id: number; role: AppRole }>('/users/me');
		return resp.data;
	}

	async listUsers(): Promise<UserWithRole[]> {
		const resp = await appApiClient.get<{ results: UserWithRole[] }>('/users');
		return resp.data.results;
	}

	async setUserRole(userId: number, role: AppRole): Promise<void> {
		await appApiClient.patch(`/users/${userId}/role`, { role });
	}

	async createUser(payload: {
		username: string; password: string; email: string;
		first_name?: string; last_name?: string; role: AppRole;
	}): Promise<{ id: number; username: string; email: string; role: AppRole }> {
		const resp = await appApiClient.post('/users', payload);
		return resp.data;
	}

	async setUserActive(userId: number, isActive: boolean): Promise<void> {
		await appApiClient.patch(`/users/${userId}/active`, { is_active: isActive });
	}

	async banUser(userId: number, durationDays: number | null, reason: string): Promise<void> {
		await appApiClient.post(`/moderation/users/${userId}/ban`, {
			duration_days: durationDays,
			reason,
		});
	}

	async recordUpload(cvat_task_id: number, batch_name: string, file_count: number): Promise<void> {
		await appApiClient.post('/upload-history', { cvat_task_id, batch_name, file_count });
	}

	async getMyModerationStatuses(): Promise<ModerationStatusEntry[]> {
		const resp = await appApiClient.get<{ results: ModerationStatusEntry[] }>('/moderation/my-statuses');
		return resp.data.results;
	}

	async getSettings(): Promise<Record<string, string>> {
		const resp = await appApiClient.get<Record<string, string>>('/settings');
		return resp.data;
	}

	async contestRejection(items: ContestItem[], message: string): Promise<{ created: number; already_contested?: number }> {
		const resp = await appApiClient.post<{ created: number; already_contested?: number }>(
			'/moderation/contest',
			{ items, message },
		);
		return resp.data;
	}

	async getMyProfile(): Promise<UserProfile> {
		const resp = await appApiClient.get<UserProfile>('/users/me/profile');
		return resp.data;
	}

	async updateMyProfile(payload: UpdateProfilePayload): Promise<UserProfile> {
		const resp = await appApiClient.patch<UserProfile>('/users/me', payload);
		return resp.data;
	}

	async changeMyPassword(payload: ChangePasswordPayload): Promise<void> {
		await appApiClient.post('/users/me/password', payload);
	}
}
