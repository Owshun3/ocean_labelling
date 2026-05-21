import React from 'react';
import Svg, { Circle, Line } from 'react-native-svg';
import { COLORS } from '@/shared/theme/colors';

interface Props {
	size?: number;
	color?: string;
}

export const SearchIcon: React.FC<Props> = ({ size = 16, color = COLORS.text.placeholder }) => (
	<Svg width={size} height={size} viewBox="0 0 16 16">
		<Circle cx={7} cy={7} r={5} stroke={color} strokeWidth={1.5} fill="none" />
		<Line x1={10.6} y1={10.6} x2={14.5} y2={14.5} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
	</Svg>
);
