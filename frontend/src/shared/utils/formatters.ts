/**
 * Helpers de formatage partagés (dates, durées, tailles). À utiliser à la
 * place de définir des `fmt*` locaux dans chaque écran. Toujours préférer
 * ces fonctions plutôt qu'une variante presque-identique côté composant.
 */

const FALLBACK = '—';

/** Format vidéo court "1:23" / "12:05". Renvoie "—" si nul/invalide. */
export function formatVideoDuration(seconds: number | null | undefined): string {
	if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return FALLBACK;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.floor(seconds % 60);
	return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

/** Taille adaptative o / Ko / Mo / Go. Renvoie "—" si null/NaN. */
export function formatBytes(bytes: number | null | undefined): string {
	if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return FALLBACK;
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} Go`;
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} Mo`;
	if (bytes >= 1024)      return `${Math.round(bytes / 1024)} Ko`;
	return `${bytes} o`;
}

/** Durée longue type uptime : "45 s", "12 min", "2 h 15 min", "3 j 4 h". */
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

/** Date au format français court "5 mai 2026". Renvoie "—" si invalide. */
export function formatDateShort(iso: string | null | undefined): string {
	if (!iso) return FALLBACK;
	try {
		return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
	} catch { return iso; }
}

/** Date + heure "5 mai 2026, 14:32". Renvoie "—" si invalide. */
export function formatDateTime(iso: string | null | undefined): string {
	if (!iso) return FALLBACK;
	try {
		return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	} catch { return iso; }
}
