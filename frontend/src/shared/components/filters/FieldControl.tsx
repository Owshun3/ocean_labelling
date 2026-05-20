import React from 'react';
import { View, Text, TextInput, Pressable, Platform } from 'react-native';
import type { FilterField } from './types';
import { COLORS } from '@/shared/theme/colors';
import { filterStyles as styles, dateInputStyle } from './styles';

interface FieldControlProps {
	field: FilterField;
	value: any;
	onChange: (next: any) => void;
}

/**
 * Rend le contrôle UI adapté à un `FilterField` selon son `kind`.
 * Dispatcher pur : pas d'état local. Chaque sous-rendu est inline et bref ;
 * si l'un d'eux dépasse 30 lignes, l'extraire en composant nommé.
 */
export function FieldControl({ field, value, onChange }: FieldControlProps) {
	switch (field.kind) {
		case 'text':       return <TextField     field={field} value={value} onChange={onChange} />;
		case 'chips':      return <ChipsField    field={field} value={value} onChange={onChange} />;
		case 'bool':       return <BoolField     field={field} value={value} onChange={onChange} />;
		case 'date-range': return <DateRangeField field={field} value={value} onChange={onChange} />;
		case 'number-range': return <NumberRangeField field={field} value={value} onChange={onChange} />;
		default:           return null;
	}
}

function TextField({ field, value, onChange }: FieldControlProps) {
	if (field.kind !== 'text') return null;
	return (
		<View style={styles.field}>
			<Text style={styles.fieldLabel}>{field.label}</Text>
			<TextInput
				style={styles.textInput}
				value={value ?? ''}
				onChangeText={onChange}
				placeholder={field.placeholder}
				placeholderTextColor={COLORS.text.placeholder}
			/>
		</View>
	);
}

function ChipsField({ field, value, onChange }: FieldControlProps) {
	if (field.kind !== 'chips') return null;
	const selected: string[] = Array.isArray(value) ? value : [];
	const toggle = (v: string) => {
		if (field.multi) {
			onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
		} else {
			onChange(selected.includes(v) ? [] : [v]);
		}
	};
	return (
		<View style={styles.field}>
			<Text style={styles.fieldLabel}>{field.label}</Text>
			<View style={styles.chipsRow}>
				{field.options.map((opt) => {
					const isOn = selected.includes(opt.value);
					return (
						<Pressable
							key={opt.value}
							onPress={() => toggle(opt.value)}
							style={[styles.chip, isOn && styles.chipOn]}
						>
							<Text style={[styles.chipText, isOn && styles.chipTextOn]}>{opt.label}</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

function BoolField({ field, value, onChange }: FieldControlProps) {
	if (field.kind !== 'bool') return null;
	const current: boolean | null = value === true || value === false ? value : null;
	const Btn = ({ target, label }: { target: boolean | null; label: string }) => (
		<Pressable onPress={() => onChange(target)} style={[styles.chip, current === target && styles.chipOn]}>
			<Text style={[styles.chipText, current === target && styles.chipTextOn]}>{label}</Text>
		</Pressable>
	);
	return (
		<View style={styles.field}>
			<Text style={styles.fieldLabel}>{field.label}</Text>
			<View style={styles.chipsRow}>
				<Btn target={null} label="Tous" />
				<Btn target={true} label={field.trueLabel ?? 'Oui'} />
				<Btn target={false} label={field.falseLabel ?? 'Non'} />
			</View>
		</View>
	);
}

function DateRangeField({ field, value, onChange }: FieldControlProps) {
	if (field.kind !== 'date-range') return null;
	const { from, to } = (value || {}) as { from?: string; to?: string };
	if (Platform.OS !== 'web') {
		return (
			<View style={styles.field}>
				<Text style={styles.fieldLabel}>{field.label}</Text>
				<Text style={styles.muted}>Disponible sur web uniquement.</Text>
			</View>
		);
	}
	return (
		<View style={styles.field}>
			<Text style={styles.fieldLabel}>{field.label}</Text>
			<View style={styles.dateRow}>
				{/* @ts-ignore — input HTML natif sur RN Web */}
				<input
					type="date"
					value={from ?? ''}
					onChange={(e: any) => onChange({ from: e.target.value || undefined, to })}
					style={dateInputStyle}
				/>
				<Text style={styles.dateSep}>→</Text>
				{/* @ts-ignore */}
				<input
					type="date"
					value={to ?? ''}
					onChange={(e: any) => onChange({ from, to: e.target.value || undefined })}
					style={dateInputStyle}
				/>
			</View>
		</View>
	);
}

function NumberRangeField({ field, value, onChange }: FieldControlProps) {
	if (field.kind !== 'number-range') return null;
	const { min, max } = (value || {}) as { min?: number; max?: number };
	const parse = (raw: string): number | undefined => {
		if (raw.trim() === '') return undefined;
		const n = Number(raw);
		return Number.isFinite(n) ? n : undefined;
	};
	return (
		<View style={styles.field}>
			<Text style={styles.fieldLabel}>{field.label}</Text>
			<View style={styles.dateRow}>
				<TextInput
					style={[styles.textInput, { width: 80 }]}
					value={min !== undefined ? String(min) : ''}
					onChangeText={(t) => onChange({ min: parse(t), max })}
					keyboardType="numeric"
				/>
				<Text style={styles.dateSep}>→</Text>
				<TextInput
					style={[styles.textInput, { width: 80 }]}
					value={max !== undefined ? String(max) : ''}
					onChangeText={(t) => onChange({ min, max: parse(t) })}
					keyboardType="numeric"
				/>
			</View>
		</View>
	);
}
