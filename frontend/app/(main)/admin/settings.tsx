import { AdminPlaceholderScreen } from '@/features/admin/screens/AdminPlaceholderScreen';
export default function AdminSettingsRoute() {
	return (
		<AdminPlaceholderScreen
			title="Paramètres système"
			hint="Prévu : édition des valeurs de app_settings (upload_max_bytes, consensus_replicas, etc.) avec validation côté serveur. Audit dans logs d'activité."
		/>
	);
}
