import { AdminPlaceholderScreen } from '@/features/admin/screens/AdminPlaceholderScreen';
export default function AdminContestationsRoute() {
	return (
		<AdminPlaceholderScreen
			title="Contestations"
			hint="Prévu : deux files, médias rejetés contestés (overturned → re-validation) et annotations curator-validées contestées (réouverture de curation). Messages des contestants visibles."
		/>
	);
}
