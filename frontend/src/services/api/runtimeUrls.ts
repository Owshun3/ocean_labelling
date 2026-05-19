/**
 * URLs API derivees au runtime depuis window.location.
 *
 * Permet a un seul bundle de fonctionner en dev local (Metro sur 8081, gateway
 * sur 8888) ET en prod HTTPS (otf.upf.pf sur 443) sans rebuild.
 *
 * Regle :
 *   - Si on accede via Metro (port 8081) -> l'API est sur le port 8888 du meme host
 *   - Sinon (gateway HTTP 8888 ou gateway HTTPS 443) -> meme origine
 *
 * Override possible via EXPO_PUBLIC_APP_API_URL (inline au bundling Metro)
 * pour les cas particuliers (tunneling, dev distribue, etc.).
 */

function computeAppApiBase(): string {
	const override = process.env.EXPO_PUBLIC_APP_API_URL;
	if (override) return override;

	if (typeof window === 'undefined') {
		// SSR / build statique : fallback raisonnable, sera remplace au mount.
		return 'http://localhost:8888/app-api';
	}

	const { protocol, hostname, port } = window.location;

	// Acces via Expo Metro -> API gateway sur 8888 du meme host
	if (port === '8081') {
		return `${protocol}//${hostname}:8888/app-api`;
	}

	// Acces via gateway (8888 en HTTP, 443 en HTTPS, etc.) -> meme origine
	const portSuffix = port ? `:${port}` : '';
	return `${protocol}//${hostname}${portSuffix}/app-api`;
}

export const APP_API_BASE = computeAppApiBase();
