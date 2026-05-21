import { AxiosInstance } from 'axios';
import { Platform } from 'react-native';
import { clearSessionAlive, clearUserProfile, isSessionAlive } from './authStorage';
import { getRouterRef } from './routerRef';

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

// In-memory fallback for environments without sessionStorage (mobile).
// On web we mirror to sessionStorage so a hard refresh still surfaces the message.
let banInfoMem: BanSessionInfo | null = null;
let sessionExpiredMem: SessionExpiredInfo | null = null;

function storeBan(info: BanSessionInfo): void {
	banInfoMem = info;
	if (Platform.OS === 'web' && typeof window !== 'undefined') {
		try { window.sessionStorage.setItem(BAN_SESSION_KEY, JSON.stringify(info)); } catch {}
	}
}

function storeSessionExpired(info: SessionExpiredInfo): void {
	sessionExpiredMem = info;
	if (Platform.OS === 'web' && typeof window !== 'undefined') {
		try { window.sessionStorage.setItem(SESSION_EXPIRED_KEY, JSON.stringify(info)); } catch {}
	}
}

function isBanResponse(status: number, data: any): boolean {
	return status === 403 && data?.error === 'Compte banni';
}

function detectSessionExpired(status: number, data: any): SessionExpiredInfo | null {
	if (status !== 401) return null;
	if (data?.hint === 'no_cookie')          return null;
	if (data?.hint === 'cvat_unreachable')   return { reason: 'cvat_unreachable', detail: data?.error || null };
	if (data?.hint === 'expired' || data?.hint === 'idle_timeout' || data?.hint === 'unknown_session' || data?.hint?.startsWith?.('cvat_returned_')) {
		return { reason: 'token_invalid', detail: data?.error || null };
	}
	if (typeof data?.detail === 'string' && data.detail !== 'Authentication credentials were not provided.') {
		return { reason: 'token_invalid', detail: data.detail };
	}
	return null;
}

async function clearAndRedirect(): Promise<boolean> {
	clearSessionAlive();
	clearUserProfile();
	if (Platform.OS === 'web' && typeof window !== 'undefined') {
		if (window.location.pathname !== LOGIN_PATH) {
			window.location.href = LOGIN_PATH;
			return true;
		}
		return false;
	}
	const router = getRouterRef();
	if (router) {
		try { router.replace('/(auth)/login' as any); return true; } catch {}
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
				storeBan({
					reason:     data.reason     ?? null,
					expires_at: data.expires_at ?? null,
					banned_at:  data.banned_at  ?? null,
				});
				const redirected = await clearAndRedirect();
				if (redirected) return NEVER_RESOLVING;
				return Promise.reject(error);
			}

			const expired = detectSessionExpired(status, data);
			if (expired) {
				const hadSession = isSessionAlive();
				if (hadSession) {
					storeSessionExpired(expired);
					const redirected = await clearAndRedirect();
					if (redirected) return NEVER_RESOLVING;
				}
			}

			return Promise.reject(error);
		}
	);
}

export function consumeBanInfo(): BanSessionInfo | null {
	if (banInfoMem) {
		const info = banInfoMem;
		banInfoMem = null;
		if (Platform.OS === 'web' && typeof window !== 'undefined') {
			try { window.sessionStorage.removeItem(BAN_SESSION_KEY); } catch {}
		}
		return info;
	}
	if (Platform.OS === 'web' && typeof window !== 'undefined') {
		try {
			const raw = window.sessionStorage.getItem(BAN_SESSION_KEY);
			if (!raw) return null;
			window.sessionStorage.removeItem(BAN_SESSION_KEY);
			return JSON.parse(raw) as BanSessionInfo;
		} catch {
			return null;
		}
	}
	return null;
}

export function consumeSessionExpired(): SessionExpiredInfo | null {
	if (sessionExpiredMem) {
		const info = sessionExpiredMem;
		sessionExpiredMem = null;
		if (Platform.OS === 'web' && typeof window !== 'undefined') {
			try { window.sessionStorage.removeItem(SESSION_EXPIRED_KEY); } catch {}
		}
		return info;
	}
	if (Platform.OS === 'web' && typeof window !== 'undefined') {
		try {
			const raw = window.sessionStorage.getItem(SESSION_EXPIRED_KEY);
			if (!raw) return null;
			window.sessionStorage.removeItem(SESSION_EXPIRED_KEY);
			return JSON.parse(raw) as SessionExpiredInfo;
		} catch {
			return null;
		}
	}
	return null;
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
