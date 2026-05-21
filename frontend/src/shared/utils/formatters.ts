const FALLBACK = '—';

export function formatVideoDuration(seconds: number | null | undefined): string {
	if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return FALLBACK;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.floor(seconds % 60);
	return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function formatBytes(bytes: number | null | undefined): string {
	if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return FALLBACK;
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} Go`;
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} Mo`;
	if (bytes >= 1024)      return `${Math.round(bytes / 1024)} Ko`;
	return `${bytes} o`;
}

export function formatUptime(totalSeconds: number): string {
	if (totalSeconds < 60) return `${totalSeconds} s`;
	const minutes = Math.floor(totalSeconds / 60);
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const remMinutes = minutes % 60;
	if (hours < 24) return remMinutes ? `${hours} h ${remMinutes} min` : `${hours} h`;
	const days = Math.floor(hours / 24);
	return `${days} j ${hours % 24} h`;
}

export function formatDateShort(iso: string | null | undefined): string {
	if (!iso) return FALLBACK;
	try {
		return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
	} catch { return iso; }
}

export function formatDateTime(iso: string | null | undefined): string {
	if (!iso) return FALLBACK;
	try {
		return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	} catch { return iso; }
}
