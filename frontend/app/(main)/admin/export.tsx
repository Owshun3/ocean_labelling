import { AdminPlaceholderScreen } from '@/features/admin/screens/AdminPlaceholderScreen';
export default function AdminExportRoute() {
	return (
		<AdminPlaceholderScreen
			title="Export des données"
			hint="Prévu : export Datumaro avec page de sélection (filtres par utilisateur, espèce, tag, période). Le périmètre exportable pour le rôle chercheur sera contraint par cette même page."
		/>
	);
}
