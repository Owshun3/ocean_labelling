import { Redirect } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { ChercheurExportRequestsScreen } from '@/features/chercheur/screens/ChercheurExportRequestsScreen';

export default function ChercheurExportRequestsRoute() {
	const profile = getUserProfile();
	// La fonctionnalité de demande est exclusive au rôle chercheur.
	if (!profile || profile.appRole !== 'chercheur') return <Redirect href="/(main)" />;
	return <ChercheurExportRequestsScreen />;
}
