import axios from 'axios';
import { attachBanInterceptor } from './banInterceptor';

const APP_API_BASE = process.env.EXPO_PUBLIC_APP_API_URL || 'http://localhost:8888/app-api';

export const appApiClient = axios.create({ baseURL: APP_API_BASE, withCredentials: true });

attachBanInterceptor(appApiClient);

export type AppRole = 'admin' | 'moderator' | 'curator' | 'chercheur' | 'annotator' | 'guest';
export type AccountState = 'active' | 'disabled' | 'banned';
export type ModerationStatus = 'pending' | 'validated' | 'rejected';

export interface ModerationStatusEntry {
	cvat_task_id: number;
	status: ModerationStatus;
	review_comment: string | null;
	reviewed_at: string | null;
}

export interface UserProfileStats {
	annotations_validated: number;
	media_validated: number;
	media_rejected: number;
	actions_validated_total: number;
	precision_annotations: number | null;
	acceptance_media: number | null;
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

	async contestRejection(ids: number[], message: string): Promise<{ created: number; ignored: number }> {
		const resp = await appApiClient.post<{ created: number; ignored: number }>(
			'/moderation/contest',
			{ ids, message },
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
