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
				{/* @ts-ignore */}
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

	const errors: string[] = [];
	if (field.min !== undefined && min !== undefined && min < field.min) {
		errors.push(`Le minimum doit être ≥ ${field.min}.`);
	}
	if (field.max !== undefined && max !== undefined && max > field.max) {
		errors.push(`Le maximum doit être ≤ ${field.max}.`);
	}
	if (min !== undefined && max !== undefined && max < min) {
		errors.push('Le maximum doit être supérieur ou égal au minimum.');
	}
	const minInvalid = field.min !== undefined && min !== undefined && min < field.min;
	const maxInvalid = (min !== undefined && max !== undefined && max < min)
		|| (field.max !== undefined && max !== undefined && max > field.max);

	return (
		<View style={styles.field}>
			<Text style={styles.fieldLabel}>{field.label}</Text>
			<View style={styles.dateRow}>
				<View>
					<TextInput
						style={[styles.textInput, { width: 80 }, minInvalid && styles.textInputError]}
						value={min !== undefined ? String(min) : ''}
						onChangeText={(t) => onChange({ min: parse(t), max })}
						keyboardType="numeric"
						placeholder={field.min !== undefined ? String(field.min) : ''}
						placeholderTextColor={COLORS.text.placeholder}
					/>
					<Text style={styles.rangeHint}>minimum</Text>
				</View>
				<Text style={styles.dateSep}>→</Text>
				<View>
					<TextInput
						style={[styles.textInput, { width: 80 }, maxInvalid && styles.textInputError]}
						value={max !== undefined ? String(max) : ''}
						onChangeText={(t) => onChange({ min, max: parse(t) })}
						keyboardType="numeric"
						placeholder={field.max !== undefined ? String(field.max) : ''}
						placeholderTextColor={COLORS.text.placeholder}
					/>
					<Text style={styles.rangeHint}>maximum</Text>
				</View>
			</View>
			{errors.length > 0 ? (
				<Text style={styles.errorText}>{errors.join(' ')}</Text>
			) : null}
		</View>
	);
}
