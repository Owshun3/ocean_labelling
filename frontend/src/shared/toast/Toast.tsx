import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/shared/theme/colors';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastPayload {
	type: ToastType;
	message: string;
	durationMs?: number;
}

type Listener = (toast: ToastPayload & { id: number }) => void;

let nextId = 1;
const listeners = new Set<Listener>();

export function showToast(payload: ToastPayload): void {
	const enriched = { id: nextId++, ...payload };
	listeners.forEach((l) => l(enriched));
}

export const toast = {
	success: (message: string, durationMs?: number) => showToast({ type: 'success', message, durationMs }),
	error:   (message: string, durationMs?: number) => showToast({ type: 'error',   message, durationMs }),
	info:    (message: string, durationMs?: number) => showToast({ type: 'info',    message, durationMs }),
};

const TYPE_STYLE: Record<ToastType, { bg: string; border: string; icon: keyof typeof Ionicons.glyphMap; iconColor: string }> = {
	success: { bg: '#dcfce7', border: '#16a34a', icon: 'checkmark-circle', iconColor: '#16a34a' },
	error:   { bg: '#fee2e2', border: '#dc2626', icon: 'close-circle',     iconColor: '#dc2626' },
	info:    { bg: '#dbeafe', border: '#2563eb', icon: 'information-circle', iconColor: '#2563eb' },
};

interface Item extends ToastPayload { id: number; opacity: Animated.Value; }

export const ToastHost: React.FC = () => {
	const [items, setItems] = useState<Item[]>([]);
	const itemsRef = useRef(items);
	itemsRef.current = items;

	useEffect(() => {
		const listener: Listener = (payload) => {
			const opacity = new Animated.Value(0);
			const item: Item = { ...payload, opacity };
			setItems((prev) => [...prev, item]);
			Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
			const duration = payload.durationMs ?? (payload.type === 'error' ? 5000 : 3500);
			setTimeout(() => dismiss(payload.id), duration);
		};
		listeners.add(listener);
		return () => { listeners.delete(listener); };
	}, []);

	const dismiss = (id: number) => {
		const item = itemsRef.current.find((i) => i.id === id);
		if (!item) return;
		Animated.timing(item.opacity, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start(() => {
			setItems((prev) => prev.filter((i) => i.id !== id));
		});
	};

	return (
		<View pointerEvents="box-none" style={styles.host}>
			{items.map((item) => {
				const style = TYPE_STYLE[item.type];
				return (
					<Animated.View
						key={item.id}
						style={[styles.toast, { backgroundColor: style.bg, borderColor: style.border, opacity: item.opacity }]}
					>
						<Ionicons name={style.icon} size={20} color={style.iconColor} />
						<Text style={styles.message}>{item.message}</Text>
						<Pressable onPress={() => dismiss(item.id)} style={styles.closeBtn}>
							<Ionicons name="close" size={16} color={COLORS.text.secondary} />
						</Pressable>
					</Animated.View>
				);
			})}
		</View>
	);
};

const styles = StyleSheet.create({
	host: {
		position: 'absolute',
		top: 16,
		left: 0,
		right: 0,
		alignItems: 'center',
		zIndex: 9999,
		gap: 8,
	},
	toast: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingVertical: 10,
		paddingHorizontal: 14,
		borderRadius: 8,
		borderWidth: 1,
		minWidth: 280,
		maxWidth: 520,
		boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
		elevation: 4,
	},
	message: { flex: 1, fontSize: 13, color: COLORS.text.primary, fontWeight: '500' },
	closeBtn: { padding: 2 },
});
