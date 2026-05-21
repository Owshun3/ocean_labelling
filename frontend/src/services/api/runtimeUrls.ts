import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * URLs API derivees au runtime.
 *
 * Sur web : on lit window.location pour qu'un seul bundle fonctionne en dev
 * local (Metro 8081, gateway 8888) ET en prod HTTPS (n'importe quel domaine)
 * sans rebuild.
 *
 * Sur mobile : on lit EXPO_PUBLIC_APP_API_URL (env injecté au bundling). Si non
 * défini, on tente l'IP LAN derivee de Expo Metro (hostUri) pour le dev. Pour la
 * prod, EXPO_PUBLIC_APP_API_URL doit pointer sur l'URL stable du serveur.
 */

function computeAppApiBase(): string {
	const override = process.env.EXPO_PUBLIC_APP_API_URL;
	if (override) return override;

	if (Platform.OS === 'web') {
		if (typeof window === 'undefined') return 'http://localhost:8888/app-api';
		const { protocol, hostname, port } = window.location;
		if (port === '8081') return `${protocol}//${hostname}:8888/app-api`;
		const portSuffix = port ? `:${port}` : '';
		return `${protocol}//${hostname}${portSuffix}/app-api`;
	}

	// Mobile: try Expo Metro hostUri (ex: "192.168.1.42:8081") for dev hot reload.
	const hostUri = (Constants.expoConfig as any)?.hostUri
		?? (Constants as any)?.expoGoConfig?.debuggerHost
		?? null;
	if (typeof hostUri === 'string' && hostUri.includes(':')) {
		const host = hostUri.split(':')[0];
		return `http://${host}:8888/app-api`;
	}

	// Fallback: localhost (won't reach a physical device, but keeps the bundle compiling).
	return 'http://localhost:8888/app-api';
}

export const APP_API_BASE = computeAppApiBase();
