import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Stage, Layer, Image as KonvaImage, Rect, Group, Transformer } from 'react-konva';
import type Konva from 'konva';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { useStudioFrame } from '../hooks/useStudioFrame';
import { StudioShape, StudioTool } from '../types';

interface Props {
	jobId: number;
	frameNumber: number;
	tool: StudioTool;
	shapes: StudioShape[];
	selectedId: string | null;
	onAddShape:    (shape: StudioShape) => void;
	onSelectShape: (id: string | null) => void;
	onUpdateShape: (id: string, patch: Partial<StudioShape>) => void;
}

interface FitTransform {
	scale: number;
	offsetX: number;
	offsetY: number;
}

function computeFit(stageW: number, stageH: number, imgW: number, imgH: number): FitTransform {
	if (stageW <= 0 || stageH <= 0 || imgW <= 0 || imgH <= 0) {
		return { scale: 1, offsetX: 0, offsetY: 0 };
	}
	const scale = Math.min(stageW / imgW, stageH / imgH);
	return {
		scale,
		offsetX: (stageW - imgW * scale) / 2,
		offsetY: (stageH - imgH * scale) / 2,
	};
}

function newShapeId(): string {
	return Math.random().toString(36).slice(2, 11);
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }) {
	return {
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		width: Math.abs(a.x - b.x),
		height: Math.abs(a.y - b.y),
	};
}

function clampRect(r: { x: number; y: number; width: number; height: number }, imgW: number, imgH: number) {
	const x = Math.max(0, Math.min(r.x, imgW));
	const y = Math.max(0, Math.min(r.y, imgH));
	const width  = Math.max(2, Math.min(r.width,  imgW - x));
	const height = Math.max(2, Math.min(r.height, imgH - y));
	return { x, y, width, height };
}

export const StudioCanvas: React.FC<Props> = ({
	jobId, frameNumber, tool, shapes, selectedId, onAddShape, onSelectShape, onUpdateShape,
}) => {
	const { image, loading, error } = useStudioFrame(jobId, frameNumber);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [firstPoint, setFirstPoint] = useState<{ x: number; y: number } | null>(null);
	const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);

	const layerRef       = useRef<Konva.Layer | null>(null);
	const transformerRef = useRef<Konva.Transformer | null>(null);

	const fit = useMemo(
		() => computeFit(size.width, size.height, image?.width ?? 0, image?.height ?? 0),
		[size, image],
	);

	useEffect(() => {
		if (tool !== 'rectangle') {
			setFirstPoint(null);
			setHoverPoint(null);
		}
		if (tool !== 'select') onSelectShape(null);
	}, [tool, onSelectShape]);

	useEffect(() => {
		if (!transformerRef.current || !layerRef.current) return;
		if (tool === 'select' && selectedId) {
			const node = layerRef.current.findOne(`#shape-${selectedId}`);
			transformerRef.current.nodes(node ? [node] : []);
		} else {
			transformerRef.current.nodes([]);
		}
		transformerRef.current.getLayer()?.batchDraw();
	}, [selectedId, tool, shapes]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setFirstPoint(null);
				setHoverPoint(null);
				onSelectShape(null);
			}
		};
		if (typeof window !== 'undefined') {
			window.addEventListener('keydown', onKey);
			return () => window.removeEventListener('keydown', onKey);
		}
	}, [onSelectShape]);

	const stageToImage = (stageX: number, stageY: number) => {
		if (fit.scale === 0 || !image) return null;
		const ix = (stageX - fit.offsetX) / fit.scale;
		const iy = (stageY - fit.offsetY) / fit.scale;
		if (ix < 0 || iy < 0 || ix > image.width || iy > image.height) return null;
		return { x: ix, y: iy };
	};

	const handleStageClick = (evt: any) => {
		const targetType = evt.target?.getClassName?.();
		if (tool === 'select') {
			if (targetType === 'Stage' || targetType === 'Image') onSelectShape(null);
			return;
		}
		if (tool !== 'rectangle' || !image) return;
		const stage = evt.target.getStage();
		const ptr = stage?.getPointerPosition();
		if (!ptr) return;
		const img = stageToImage(ptr.x, ptr.y);
		if (!img) return;

		if (!firstPoint) {
			setFirstPoint(img);
			setHoverPoint(img);
			return;
		}
		const rect = normalizeRect(firstPoint, img);
		if (rect.width < 2 || rect.height < 2) {
			setFirstPoint(null);
			setHoverPoint(null);
			return;
		}
		const clamped = clampRect(rect, image.width, image.height);
		onAddShape({
			id: newShapeId(),
			x: clamped.x, y: clamped.y, width: clamped.width, height: clamped.height,
			status: 'unsaved',
		});
		setFirstPoint(null);
		setHoverPoint(null);
	};

	const handleStageMouseMove = (evt: any) => {
		if (tool !== 'rectangle' || !firstPoint) return;
		const stage = evt.target.getStage();
		const ptr = stage?.getPointerPosition();
		if (!ptr) return;
		const img = stageToImage(ptr.x, ptr.y);
		if (img) setHoverPoint(img);
	};

	const handleRectDragEnd = (id: string, node: Konva.Node) => {
		if (!image) return;
		const clamped = clampRect(
			{ x: node.x(), y: node.y(), width: (node as any).width(), height: (node as any).height() },
			image.width, image.height,
		);
		onUpdateShape(id, { ...clamped, status: 'unsaved' });
	};

	const handleRectTransformEnd = (id: string, node: Konva.Node) => {
		if (!image) return;
		const sx = node.scaleX();
		const sy = node.scaleY();
		const newW = (node as any).width() * sx;
		const newH = (node as any).height() * sy;
		node.scaleX(1);
		node.scaleY(1);
		const clamped = clampRect(
			{ x: node.x(), y: node.y(), width: newW, height: newH },
			image.width, image.height,
		);
		onUpdateShape(id, { ...clamped, status: 'unsaved' });
	};

	if (Platform.OS !== 'web') {
		return (
			<View style={styles.fallback}>
				<Text style={styles.fallbackText}>Le studio d'annotation est web uniquement.</Text>
			</View>
		);
	}

	const ghost = firstPoint && hoverPoint ? normalizeRect(firstPoint, hoverPoint) : null;
	const stageCursor =
		tool === 'rectangle' && image ? 'crosshair'
		: tool === 'select' ? 'default'
		: 'default';

	return (
		<View
			style={styles.container}
			onLayout={(e) => {
				const { width, height } = e.nativeEvent.layout;
				setSize({ width, height });
			}}
		>
			{loading && (
				<View style={styles.overlay} pointerEvents="none">
					<ActivityIndicator size="large" color={COLORS.primary} />
				</View>
			)}
			{error && (
				<View style={styles.overlay} pointerEvents="none">
					<Text style={styles.errorText}>Erreur : {error}</Text>
				</View>
			)}
			{size.width > 0 && size.height > 0 && (
				<Stage
					width={size.width}
					height={size.height}
					onClick={handleStageClick}
					onTap={handleStageClick}
					onMouseMove={handleStageMouseMove}
					style={{ cursor: stageCursor }}
				>
					<Layer ref={layerRef as any}>
						<Group x={fit.offsetX} y={fit.offsetY} scaleX={fit.scale} scaleY={fit.scale}>
							{image && <KonvaImage image={image} listening />}
							{shapes.map((s) => {
								const stroke = s.status === 'saved' ? COLORS.status.validated : COLORS.warning;
								const isSelected = tool === 'select' && selectedId === s.id;
								return (
									<Rect
										key={s.id}
										id={`shape-${s.id}`}
										x={s.x} y={s.y}
										width={s.width} height={s.height}
										stroke={stroke}
										strokeWidth={2 / fit.scale}
										strokeScaleEnabled={false}
										fill={`${stroke}22`}
										draggable={tool === 'select'}
										onClick={(e) => {
											if (tool === 'select') {
												onSelectShape(s.id);
												e.cancelBubble = true;
											}
										}}
										onDragEnd={(e) => handleRectDragEnd(s.id, e.target)}
										onTransformEnd={(e) => handleRectTransformEnd(s.id, e.target)}
										shadowEnabled={isSelected}
										shadowColor={COLORS.primary}
										shadowBlur={isSelected ? 8 / fit.scale : 0}
									/>
								);
							})}
							{ghost && (
								<Rect
									x={ghost.x} y={ghost.y}
									width={ghost.width} height={ghost.height}
									stroke={COLORS.warning}
									strokeWidth={2}
									strokeScaleEnabled={false}
									dash={[8 / fit.scale, 4 / fit.scale]}
									listening={false}
								/>
							)}
						</Group>
						<Transformer
							ref={transformerRef as any}
							rotateEnabled={false}
							flipEnabled={false}
							ignoreStroke
							anchorSize={8}
							borderStroke={COLORS.primary}
							anchorStroke={COLORS.primary}
							anchorFill={COLORS.background.card}
							boundBoxFunc={(_old, next) => {
								if (next.width < 4 || next.height < 4) return _old;
								return next;
							}}
						/>
					</Layer>
				</Stage>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, position: 'relative', backgroundColor: COLORS.background.imagePlaceholder },
	overlay: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
	},
	errorText: { ...TYPOGRAPHY.body, color: COLORS.danger },
	fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
	fallbackText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
});
