import { AdminPlaceholderScreen } from '@/features/admin/screens/AdminPlaceholderScreen';
export default function AdminCurationRoute() {
	return (
		<AdminPlaceholderScreen
			title="Assignation curation"
			hint="Prévu : distribuer des batches de médias annotés aux curators. Algorithme d'assignation à concevoir (round-robin, charge, expertise par tag d'espèce…)."
		/>
	);
}
