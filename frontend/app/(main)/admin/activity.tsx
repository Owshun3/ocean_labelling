import { AdminPlaceholderScreen } from '@/features/admin/screens/AdminPlaceholderScreen';
export default function AdminActivityRoute() {
	return (
		<AdminPlaceholderScreen
			title="Logs d'activité"
			hint="Prévu : flux des actions admin (bannissements, changements de rôle, validations curator, modifications paramètres). Repose sur une future table admin_actions(admin_id, action, target_type, target_id, payload JSONB, created_at)."
		/>
	);
}
