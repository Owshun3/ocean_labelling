import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Stage, Layer, Image as KonvaImage, Rect, Group, Transformer } from 'react-konva';
import type Konva from 'konva';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { useStudioFrame } from '@/features/studio/hooks/useStudioFrame';
import type { StudioTool } from '@/features/studio/types';
import { curatorClient, type Proposal } from '@/services/api/CuratorService';
import type { CuratorBbox, CuratorMode, CuratorOpacity } from '../hooks/useCuratorMode';
import { opacityToFloat } from '../hooks/useCuratorMode';
import { CURATOR_COLOR, CURATOR_STROKE_WIDTH, ANNOTATOR_STROKE_WIDTH } from '../utils/annotatorColors';

export interface CuratorCanvasHandle {
	zoomIn:    () => void;
	zoomOut:   () => void;
	resetZoom: () => void;
}

export interface HoveredProposal {
	proposal: Proposal;
	x: number;
	y: number;
}

interface Props {
	jobId: number;
	mode: CuratorMode;
	tool: StudioTool;
	proposals: Proposal[];
	selectedIds: Set<number>;
	annotatorColor: string;
	opacity: CuratorOpacity;
	curatorBbox: CuratorBbox | null;
	onToggleSelect:  (proposalId: number, kind: 'single' | 'toggle' | 'range', ordered: number[]) => void;
	onSetCuratorBbox: (bbox: CuratorBbox | null) => void;
	onHover:         (h: HoveredProposal | null) => void;
}

const ZOOM_STEP = 1.25;
const ZOOM_MIN  = 0.2;
const ZOOM_MAX  = 8;
const MIN_RECT  = 4;

function computeFit(stageW: number, stageH: number, imgW: number, imgH: number) {
	if (stageW <= 0 || stageH <= 0 || imgW <= 0 || imgH <= 0) return { scale: 1, offsetX: 0, offsetY: 0 };
	const scale = Math.min(stageW / imgW, stageH / imgH);
	return { scale, offsetX: (stageW - imgW * scale) / 2, offsetY: (stageH - imgH * scale) / 2 };
}

function normalize(a: { x: number; y: number }, b: { x: number; y: number }) {
	return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

function clamp(r: { x: number; y: number; width: number; height: number }, imgW: number, imgH: number) {
	const x = Math.max(0, Math.min(r.x, imgW));
	const y = Math.max(0, Math.min(r.y, imgH));
	return { x, y, width: Math.max(2, Math.min(r.width, imgW - x)), height: Math.max(2, Math.min(r.height, imgH - y)) };
}

export const CuratorCanvas = forwardRef<CuratorCanvasHandle, Props>(({
	jobId, mode, tool, proposals, selectedIds, annotatorColor, opacity, curatorBbox,
	onToggleSelect, onSetCuratorBbox, onHover,
}, ref) => {
	const { image, loading, error } = useStudioFrame(jobId, 0, {
		client: curatorClient,
		path:   `/jobs/${jobId}/frame`,
		params: { number: 0, quality: 'compressed' },
	});
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
		setStagePos({ x: focus.x - pointTo.x * clamped, y: focus.y - pointTo.y * clamped });
	};

	useImperativeHandle(ref, () => ({
		zoomIn:    () => zoomTo(stageScale * ZOOM_STEP, { x: size.width / 2, y: size.height / 2 }),
		zoomOut:   () => zoomTo(stageScale / ZOOM_STEP, { x: size.width / 2, y: size.height / 2 }),
		resetZoom: () => { setStageScale(1); setStagePos({ x: 0, y: 0 }); },
	}), [stageScale, stagePos, size]);

	useEffect(() => {
		if (mode === 'review') { setDrawStart(null); setDrawEnd(null); }
	}, [mode]);

	useEffect(() => {
		if (!transformerRef.current || !layerRef.current) return;
		if (mode === 'drawing' && curatorBbox) {
			const node = layerRef.current.findOne('#curator-bbox');
			transformerRef.current.nodes(node ? [node] : []);
		} else {
			transformerRef.current.nodes([]);
		}
		transformerRef.current.getLayer()?.batchDraw();
	}, [mode, curatorBbox]);

	const getImagePos = (): { x: number; y: number } | null => {
		const group = groupRef.current;
		if (!group || !image) return null;
		const pos = group.getRelativePointerPosition();
		if (!pos) return null;
		if (pos.x < 0 || pos.y < 0 || pos.x > image.width || pos.y > image.height) return null;
		return pos;
	};

	const handleMouseDown = () => {
		if (tool === 'pan') {
			const ptr = stageRef.current?.getPointerPosition();
			if (ptr) panLastRef.current = ptr;
			return;
		}
		if (mode === 'drawing' && tool === 'rectangle' && image && !curatorBbox) {
			const pos = getImagePos();
			if (!pos) return;
			setDrawStart(pos);
			setDrawEnd(pos);
		}
	};

	const handleMouseMove = () => {
		if (tool === 'pan' && panLastRef.current) {
			const ptr = stageRef.current?.getPointerPosition();
			if (!ptr) return;
			const dx = ptr.x - panLastRef.current.x;
			const dy = ptr.y - panLastRef.current.y;
			panLastRef.current = ptr;
			setStagePos((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
			return;
		}
		if (mode === 'drawing' && tool === 'rectangle' && drawStart) {
			const pos = getImagePos();
			if (pos) setDrawEnd(pos);
		}
	};

	const handleMouseUp = () => {
		if (tool === 'pan') { panLastRef.current = null; return; }
		if (mode === 'drawing' && drawStart && drawEnd && image) {
			const r = normalize(drawStart, drawEnd);
			if (r.width >= MIN_RECT && r.height >= MIN_RECT) {
				onSetCuratorBbox(clamp(r, image.width, image.height));
			}
			setDrawStart(null);
			setDrawEnd(null);
		}
	};

	const handleWheel = (e: any) => {
		if (typeof e.evt?.preventDefault === 'function') e.evt.preventDefault();
		const ptr = stageRef.current?.getPointerPosition();
		if (!ptr) return;
		const direction = e.evt.deltaY > 0 ? -1 : 1;
		const target = direction > 0 ? stageScale * 1.1 : stageScale / 1.1;
		zoomTo(target, ptr);
	};

	const handleCuratorDragEnd = (node: Konva.Node) => {
		if (!image || !curatorBbox) return;
		const c = clamp({ x: node.x(), y: node.y(), width: curatorBbox.width, height: curatorBbox.height }, image.width, image.height);
		onSetCuratorBbox(c);
	};

	const handleCuratorTransformEnd = (node: Konva.Node) => {
		if (!image) return;
		const sx = node.scaleX();
		const sy = node.scaleY();
		const newW = (node as any).width() * sx;
		const newH = (node as any).height() * sy;
		node.scaleX(1);
		node.scaleY(1);
		onSetCuratorBbox(clamp({ x: node.x(), y: node.y(), width: newW, height: newH }, image.width, image.height));
	};

	if (Platform.OS !== 'web') {
		return <View style={styles.fallback}><Text>Studio curator web uniquement.</Text></View>;
	}

	const ghost = drawStart && drawEnd ? normalize(drawStart, drawEnd) : null;
	const stageCursor =
		tool === 'pan' ? (panLastRef.current ? 'grabbing' : 'grab')
		: (mode === 'drawing' && tool === 'rectangle' && image && !curatorBbox) ? 'crosshair'
		: 'default';

	const strokeUnit = ANNOTATOR_STROKE_WIDTH / (fit.scale * stageScale);
	const dashUnit  = 6 / (fit.scale * stageScale);
	const curatorStrokeUnit = CURATOR_STROKE_WIDTH / (fit.scale * stageScale);
	const ordered = proposals.map((p) => p.cvat_shape_id);

	return (
		<View
			style={styles.container}
			onLayout={(e) => {
				const { width, height } = e.nativeEvent.layout;
				setSize({ width, height });
			}}
		>
			{loading && <View style={styles.overlay} pointerEvents="none"><ActivityIndicator size="large" color={COLORS.primary} /></View>}
			{error && <View style={styles.overlay} pointerEvents="none"><Text style={styles.errorText}>Erreur : {error}</Text></View>}

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
							{proposals.map((p) => {
								const isSelected = selectedIds.has(p.cvat_shape_id);
								const op = isSelected ? 1 : opacityToFloat(opacity);
								return (
									<Rect
										key={p.cvat_shape_id}
										id={`proposal-${p.cvat_shape_id}`}
										x={p.x} y={p.y}
										width={p.width} height={p.height}
										stroke={annotatorColor}
										strokeWidth={strokeUnit}
										strokeScaleEnabled={false}
										fill={`${annotatorColor}22`}
										opacity={op}
										listening={op > 0 && tool !== 'pan'}
										onClick={(e) => {
											if (tool === 'pan') return;
											const native = e.evt as MouseEvent;
											const kind: 'single' | 'toggle' | 'range' =
												native.shiftKey ? 'range'
												: (native.ctrlKey || native.metaKey) ? 'toggle'
												: 'single';
											onToggleSelect(p.cvat_shape_id, kind, ordered);
											e.cancelBubble = true;
										}}
										onMouseEnter={(e) => {
											if (op === 0) return;
											const stage = e.target.getStage();
											const ptr = stage?.getPointerPosition();
											if (ptr) onHover({ proposal: p, x: ptr.x, y: ptr.y });
										}}
										onMouseMove={(e) => {
											if (op === 0) return;
											const stage = e.target.getStage();
											const ptr = stage?.getPointerPosition();
											if (ptr) onHover({ proposal: p, x: ptr.x, y: ptr.y });
										}}
										onMouseLeave={() => onHover(null)}
									/>
								);
							})}
							{curatorBbox && (
								<Rect
									id="curator-bbox"
									x={curatorBbox.x} y={curatorBbox.y}
									width={curatorBbox.width} height={curatorBbox.height}
									stroke={CURATOR_COLOR}
									strokeWidth={curatorStrokeUnit}
									strokeScaleEnabled={false}
									fill={`${CURATOR_COLOR}33`}
									draggable={mode === 'drawing' && tool === 'select'}
									onDragEnd={(e) => handleCuratorDragEnd(e.target)}
									onTransformEnd={(e) => handleCuratorTransformEnd(e.target)}
								/>
							)}
							{ghost && (
								<Rect
									x={ghost.x} y={ghost.y}
									width={ghost.width} height={ghost.height}
									stroke={CURATOR_COLOR}
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
							borderStroke={CURATOR_COLOR}
							anchorStroke={CURATOR_COLOR}
							anchorFill={COLORS.background.card}
							boundBoxFunc={(_old, next) => (next.width < 4 || next.height < 4) ? _old : next}
						/>
					</Layer>
				</Stage>
			)}
		</View>
	);
});

CuratorCanvas.displayName = 'CuratorCanvas';

const styles = StyleSheet.create({
	container: { flex: 1, position: 'relative', backgroundColor: COLORS.background.imagePlaceholder, overflow: 'hidden' },
	overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
	errorText: { ...TYPOGRAPHY.body, color: COLORS.danger },
	fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
