import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Stage, Layer, Image as KonvaImage, Rect, Group, Transformer } from 'react-konva';
import type Konva from 'konva';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { useStudioFrame } from '../hooks/useStudioFrame';
import { StudioShape, StudioTool } from '../types';

export interface StudioCanvasHandle {
	zoomIn:    () => void;
	zoomOut:   () => void;
	resetZoom: () => void;
}

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

const ZOOM_STEP    = 1.25;
const ZOOM_MIN     = 0.2;
const ZOOM_MAX     = 8;
const MIN_RECT_PX  = 4;

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

export const StudioCanvas = forwardRef<StudioCanvasHandle, Props>(({
	jobId, frameNumber, tool, shapes, selectedId, onAddShape, onSelectShape, onUpdateShape,
}, ref) => {
	const { image, loading, error } = useStudioFrame(jobId, frameNumber);
	const [size, setSize] = useState({ width: 0, height: 0 });

	const [stageScale, setStageScale] = useState(1);
	const [stagePos,   setStagePos]   = useState({ x: 0, y: 0 });

	const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
	const [drawEnd,   setDrawEnd]   = useState<{ x: number; y: number } | null>(null);
	const panLastRef = useRef<{ x: number; y: number } | null>(null);

	const stageRef       = useRef<Konva.Stage | null>(null);
	const layerRef       = useRef<Konva.Layer | null>(null);
	const groupRef       = useRef<Konva.Group | null>(null);
	const transformerRef = useRef<Konva.Transformer | null>(null);

	const fit = useMemo(
		() => computeFit(size.width, size.height, image?.width ?? 0, image?.height ?? 0),
		[size, image],
	);

	const zoomTo = (newScale: number, focus: { x: number; y: number }) => {
		const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newScale));
		const pointTo = {
			x: (focus.x - stagePos.x) / stageScale,
			y: (focus.y - stagePos.y) / stageScale,
		};
		setStageScale(clamped);
		setStagePos({
			x: focus.x - pointTo.x * clamped,
			y: focus.y - pointTo.y * clamped,
		});
	};

	useImperativeHandle(ref, () => ({
		zoomIn:    () => zoomTo(stageScale * ZOOM_STEP, { x: size.width / 2, y: size.height / 2 }),
		zoomOut:   () => zoomTo(stageScale / ZOOM_STEP, { x: size.width / 2, y: size.height / 2 }),
		resetZoom: () => { setStageScale(1); setStagePos({ x: 0, y: 0 }); },
	}), [stageScale, stagePos, size]);

	useEffect(() => {
		if (tool !== 'rectangle') { setDrawStart(null); setDrawEnd(null); }
		if (tool !== 'select')    onSelectShape(null);
		if (tool !== 'pan')       panLastRef.current = null;
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
				setDrawStart(null); setDrawEnd(null);
				onSelectShape(null);
			}
		};
		if (typeof window !== 'undefined') {
			window.addEventListener('keydown', onKey);
			return () => window.removeEventListener('keydown', onKey);
		}
	}, [onSelectShape]);

	const getImagePos = (): { x: number; y: number } | null => {
		const group = groupRef.current;
		if (!group || !image) return null;
		const pos = group.getRelativePointerPosition();
		if (!pos) return null;
		if (pos.x < 0 || pos.y < 0 || pos.x > image.width || pos.y > image.height) return null;
		return pos;
	};

	const handleMouseDown = (e: any) => {
		if (tool === 'pan') {
			const stage = stageRef.current;
			const ptr = stage?.getPointerPosition();
			if (ptr) panLastRef.current = ptr;
			return;
		}
		if (tool === 'rectangle' && image) {
			const pos = getImagePos();
			if (!pos) return;
			setDrawStart(pos);
			setDrawEnd(pos);
			return;
		}
		if (tool === 'select') {
			const targetType = e.target?.getClassName?.();
			if (targetType === 'Stage' || targetType === 'Image') onSelectShape(null);
		}
	};

	const handleMouseMove = () => {
		if (tool === 'pan' && panLastRef.current) {
			const stage = stageRef.current;
			const ptr = stage?.getPointerPosition();
			if (!ptr) return;
			const dx = ptr.x - panLastRef.current.x;
			const dy = ptr.y - panLastRef.current.y;
			panLastRef.current = ptr;
			setStagePos((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
			return;
		}
		if (tool === 'rectangle' && drawStart) {
			const pos = getImagePos();
			if (pos) setDrawEnd(pos);
		}
	};

	const handleMouseUp = () => {
		if (tool === 'pan') {
			panLastRef.current = null;
			return;
		}
		if (tool === 'rectangle' && drawStart && drawEnd && image) {
			const rect = normalizeRect(drawStart, drawEnd);
			if (rect.width >= MIN_RECT_PX && rect.height >= MIN_RECT_PX) {
				const clamped = clampRect(rect, image.width, image.height);
				onAddShape({
					id: newShapeId(),
					x: clamped.x, y: clamped.y, width: clamped.width, height: clamped.height,
					status: 'unsaved',
				});
			}
			setDrawStart(null);
			setDrawEnd(null);
		}
	};

	const handleWheel = (e: any) => {
		if (typeof e.evt?.preventDefault === 'function') e.evt.preventDefault();
		const stage = stageRef.current;
		const ptr = stage?.getPointerPosition();
		if (!ptr) return;
		const direction = e.evt.deltaY > 0 ? -1 : 1;
		const target = direction > 0 ? stageScale * 1.1 : stageScale / 1.1;
		zoomTo(target, ptr);
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

	const ghost = drawStart && drawEnd ? normalizeRect(drawStart, drawEnd) : null;
	const dashUnit  = 6 / (fit.scale * stageScale);
	const strokeUnit = 1.25 / (fit.scale * stageScale);

	const stageCursor =
		tool === 'pan'       ? (panLastRef.current ? 'grabbing' : 'grab')
		: tool === 'rectangle' && image ? 'crosshair'
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
					ref={stageRef as any}
					width={size.width}
					height={size.height}
					scaleX={stageScale}
					scaleY={stageScale}
					x={stagePos.x}
					y={stagePos.y}
					onMouseDown={handleMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={handleMouseUp}
					onWheel={handleWheel}
					style={{ cursor: stageCursor }}
				>
					<Layer ref={layerRef as any}>
						<Group ref={groupRef as any} x={fit.offsetX} y={fit.offsetY} scaleX={fit.scale} scaleY={fit.scale}>
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
										strokeWidth={strokeUnit}
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
										shadowBlur={isSelected ? 8 / (fit.scale * stageScale) : 0}
									/>
								);
							})}
							{ghost && (
								<Rect
									x={ghost.x} y={ghost.y}
									width={ghost.width} height={ghost.height}
									stroke={COLORS.warning}
									strokeWidth={strokeUnit}
									strokeScaleEnabled={false}
									dash={[dashUnit * 1.5, dashUnit]}
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
});

StudioCanvas.displayName = 'StudioCanvas';

const styles = StyleSheet.create({
	container: { flex: 1, position: 'relative', backgroundColor: COLORS.background.imagePlaceholder, overflow: 'hidden' },
	overlay: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
	},
	errorText: { ...TYPOGRAPHY.body, color: COLORS.danger },
	fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
	fallbackText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
});
