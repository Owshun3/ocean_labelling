import { AxiosInstance } from 'axios';
import { Platform } from 'react-native';
import { clearAuthToken, clearUserProfile, getAuthToken } from './authStorage';

const BAN_SESSION_KEY      = 'ocean_ban_info';
const SESSION_EXPIRED_KEY  = 'ocean_session_expired';
const LOGIN_PATH           = '/login';

export interface BanSessionInfo {
	reason: string | null;
	expires_at: string | null;
	banned_at: string | null;
}

export type SessionExpiredReason = 'token_invalid' | 'cvat_unreachable';

export interface SessionExpiredInfo {
	reason: SessionExpiredReason;
	detail: string | null;
}

function isBanResponse(status: number, data: any): boolean {
	return status === 403 && data?.error === 'Compte banni';
}

function detectSessionExpired(status: number, data: any): SessionExpiredInfo | null {
	if (status !== 401) return null;
	if (data?.hint === 'no_token_sent') return null;
	if (data?.hint === 'cvat_returned_401') return { reason: 'token_invalid', detail: data?.error || null };
	if (data?.hint === 'cvat_unreachable')  return { reason: 'cvat_unreachable', detail: data?.error || null };
	if (data?.error === 'Invalid or expired CVAT token') return { reason: 'token_invalid', detail: data.error };
	if (typeof data?.detail === 'string' && data.detail !== 'Authentication credentials were not provided.') {
		return { reason: 'token_invalid', detail: data.detail };
	}
	return null;
}

async function clearAndRedirect(): Promise<boolean> {
	if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
	try { await clearAuthToken(); } catch {}
	clearUserProfile();
	if (window.location.pathname !== LOGIN_PATH) {
		window.location.href = LOGIN_PATH;
		return true;
	}
	return false;
}

const NEVER_RESOLVING: Promise<never> = new Promise(() => {});

export function attachBanInterceptor(client: AxiosInstance): void {
	client.interceptors.response.use(
		(resp) => resp,
		async (error) => {
			const status = error?.response?.status;
			const data   = error?.response?.data;

			if (isBanResponse(status, data)) {
				try {
					sessionStorage.setItem(BAN_SESSION_KEY, JSON.stringify({
						reason:     data.reason     ?? null,
						expires_at: data.expires_at ?? null,
						banned_at:  data.banned_at  ?? null,
					}));
				} catch {}
				const redirected = await clearAndRedirect();
				if (redirected) return NEVER_RESOLVING;
				return Promise.reject(error);
			}

			const expired = detectSessionExpired(status, data);
			if (expired) {
				let hadToken = false;
				try { hadToken = (await getAuthToken()) !== null; } catch {}
				if (hadToken) {
					try {
						sessionStorage.setItem(SESSION_EXPIRED_KEY, JSON.stringify(expired));
					} catch {}
					const redirected = await clearAndRedirect();
					if (redirected) return NEVER_RESOLVING;
				}
			}

			return Promise.reject(error);
		}
	);
}

export function consumeBanInfo(): BanSessionInfo | null {
	if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(BAN_SESSION_KEY);
		if (!raw) return null;
		sessionStorage.removeItem(BAN_SESSION_KEY);
		return JSON.parse(raw) as BanSessionInfo;
	} catch {
		return null;
	}
}

export function consumeSessionExpired(): SessionExpiredInfo | null {
	if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(SESSION_EXPIRED_KEY);
		if (!raw) return null;
		sessionStorage.removeItem(SESSION_EXPIRED_KEY);
		return JSON.parse(raw) as SessionExpiredInfo;
	} catch {
		return null;
	}
}

export function formatRemaining(expiresAt: string | null): string {
	if (!expiresAt) return 'permanent';
	const ms = new Date(expiresAt).getTime() - Date.now();
	if (ms <= 0) return 'expiré';
	const totalMinutes = Math.floor(ms / 60_000);
	if (totalMinutes < 1) return 'moins d\'une minute';
	if (totalMinutes < 60) return `${totalMinutes} min`;
	const totalHours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (totalHours < 24) return minutes > 0 ? `${totalHours} h ${minutes} min` : `${totalHours} h`;
	const days = Math.floor(totalHours / 24);
	const hours = totalHours % 24;
	return hours > 0 ? `${days} j ${hours} h` : `${days} j`;
}
