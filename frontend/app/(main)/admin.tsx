import { Redirect } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { AdminScreen } from '@/features/admin/screens/AdminScreen';

export default function AdminRoute() {
	const profile = getUserProfile();
	if (!profile || profile.appRole !== 'admin') return <Redirect href="/(main)" />;
	return <AdminScreen />;
}
