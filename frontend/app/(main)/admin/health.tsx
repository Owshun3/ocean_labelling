import { AdminPlaceholderScreen } from '@/features/admin/screens/AdminPlaceholderScreen';
export default function AdminHealthRoute() {
	return (
		<AdminPlaceholderScreen
			title="Santé plateforme"
			hint="Prévu : statut Postgres / CVAT / Redis, taux d'utilisation disque et mémoire, file consensus_merges en cours, agrégation des erreurs récentes."
		/>
	);
}
