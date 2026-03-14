// Copyright (C) 2026 Pyarelal Knowles, GPL v2

import type { DiffChunk } from "./types.ts";

interface MappingOptions {
	chunks: DiffChunk[];
	sourceMaxLines: number;
	targetMaxLines: number;
	sourceIsA: boolean;
	smooth: boolean;
}

interface PaneMappingContext {
	diffs: (DiffChunk[] | null)[];
	paneLineCounts: [number, number, number, number, number];
	smooth: boolean;
	diffIsReversed: boolean[];
}

function _sOf(chunk: DiffChunk, sourceIsA: boolean): [number, number] {
	return sourceIsA ? [chunk.s1, chunk.s2] : [chunk.t1, chunk.t2];
}

function _tOf(chunk: DiffChunk, sourceIsA: boolean): [number, number] {
	return sourceIsA ? [chunk.t1, chunk.t2] : [chunk.s1, chunk.s2];
}

function _chunkSrcMid(chunk: DiffChunk, sourceIsA: boolean): number {
	const [s1, s2] = _sOf(chunk, sourceIsA);
	return (s1 + s2) / 2;
}

function _chunkDstMid(chunk: DiffChunk, sourceIsA: boolean): number {
	const [t1, t2] = _tOf(chunk, sourceIsA);
	return (t1 + t2) / 2;
}

function _implicitSrcMid(gap: [number, number, number, number]): number {
	return (gap[0] + gap[1]) / 2;
}

function _implicitDstMid(gap: [number, number, number, number]): number {
	return (gap[2] + gap[3]) / 2;
}

function _upperBound(chunks: DiffChunk[], line: number, sourceIsA: boolean): number {
	let low = 0;
	let high = chunks.length;
	while (low < high) {
		const mid = (low + high) >>> 1;
		if (_sOf(chunks[mid], sourceIsA)[0] <= line) {
			low = mid + 1;
		} else {
			high = mid;
		}
	}
	return low;
}

function _getPreviousImplicitChunk(
	idx: number,
	chunks: DiffChunk[],
	sourceIsA: boolean,
): [number, number, number, number] {
	if (idx === 0) {
		return [0, 0, 0, 0];
	}

	const cur = chunks[idx];
	const prev = chunks[idx - 1];
	const [sPrevStart, sPrevEnd] = _sOf(prev, sourceIsA);
	const [tPrevStart, tPrevEnd] = _tOf(prev, sourceIsA);
	const [sCurStart, _sCurEnd] = _sOf(cur, sourceIsA);
	const [_tCurStart, _tCurEnd] = _tOf(cur, sourceIsA);

	const tCurStart = _tOf(cur, sourceIsA)[0];

	if (sCurStart > sPrevEnd) {
		return [sPrevEnd, sCurStart, tPrevEnd, tCurStart];
	}

	return [sPrevStart, sPrevEnd, tPrevStart, tPrevEnd];
}

function _getEdgeGap(
	upperBoundChunkIdx: number,
	opts: MappingOptions,
): [number, number, number, number] {
	const { chunks, sourceMaxLines, targetMaxLines, sourceIsA } = opts;

	if (upperBoundChunkIdx === 0) {
		const first = chunks[0];
		if (first && _sOf(first, sourceIsA)[0] > 0) {
			return [0, _sOf(first, sourceIsA)[0], 0, _tOf(first, sourceIsA)[0]];
		}
		return [0, 0, 0, 0];
	}

	const last = chunks[chunks.length - 1];
	const [sPrevEnd] = _sOf(last, sourceIsA).slice(1);
	const [tPrevEnd] = _tOf(last, sourceIsA).slice(1);

	const gap: [number, number, number, number] = [
		sPrevEnd,
		sourceMaxLines,
		tPrevEnd,
		targetMaxLines,
	];

	return [
		_implicitSrcMid(gap),
		sourceMaxLines,
		_implicitDstMid(gap),
		targetMaxLines,
	];
}

function _getGeneralInterpolationRanges(
	line: number,
	upperBoundChunkIdx: number,
	opts: MappingOptions,
): [number, number, number, number] {
	const { chunks, sourceIsA } = opts;
	const curUpper = chunks[upperBoundChunkIdx];
	if (!curUpper) {
		throw new Error(`Upperbound chunk at index ${upperBoundChunkIdx} not found`);
	}

	if (line < _sOf(curUpper, sourceIsA)[0]) {
		const chunk = _getPreviousImplicitChunk(upperBoundChunkIdx, chunks, sourceIsA);
		if (line < _implicitSrcMid(chunk)) {
			const prevChunk = upperBoundChunkIdx > 0 ? chunks[upperBoundChunkIdx - 1] : undefined;
			return [
				prevChunk ? _chunkSrcMid(prevChunk, sourceIsA) : 0,
				_implicitSrcMid(chunk),
				prevChunk ? _chunkDstMid(prevChunk, sourceIsA) : 0,
				_implicitDstMid(chunk),
			];
		}
		return [
			_implicitSrcMid(chunk),
			_chunkSrcMid(curUpper, sourceIsA),
			_implicitDstMid(chunk),
			_chunkDstMid(curUpper, sourceIsA),
		];
	}

	const nextIdx = upperBoundChunkIdx + 1;
	const nextGap = nextIdx < chunks.length ? _getPreviousImplicitChunk(nextIdx, chunks, sourceIsA) : undefined;

	if (nextGap && line < _implicitSrcMid(nextGap)) {
		return [
			_chunkSrcMid(curUpper, sourceIsA),
			_implicitSrcMid(nextGap),
			_chunkDstMid(curUpper, sourceIsA),
			_implicitDstMid(nextGap),
		];
	}

	const edgeGap = _getEdgeGap(chunks.length, opts);
	return [
		_chunkSrcMid(curUpper, sourceIsA),
		_implicitSrcMid(edgeGap),
		_chunkDstMid(curUpper, sourceIsA),
		_implicitDstMid(edgeGap),
	];
}

function _mapLineDiscrete(line: number, opts: MappingOptions): number {
	const { chunks, sourceIsA } = opts;
	const idx = _upperBound(chunks, line, sourceIsA);
	if (idx > 0) {
		const chunk = chunks[idx - 1];
		const [s1, s2] = _sOf(chunk, sourceIsA);
		const [t1, t2] = _tOf(chunk, sourceIsA);
		if (line < s2) {
			const ratio = (s2 - s1 > 0) ? (line - s1) / (s2 - s1) : 0;
			return t1 + ratio * (t2 - t1);
		}
	}
	return line;
}

function _mapLineSmooth(
	line: number,
	opts: MappingOptions,
	targetClamp: (val: number) => number,
): number {
	const { chunks, targetMaxLines, sourceIsA } = opts;
	const idx = _upperBound(chunks, line, sourceIsA);

	let src1: number;
	let src2: number;
	let dst1: number;
	let dst2: number;

	if (idx === 0 || idx === chunks.length) {
		const gap = _getEdgeGap(idx, opts);
		[src1, src2, dst1, dst2] = gap;
	} else {
		[src1, src2, dst1, dst2] = _getGeneralInterpolationRanges(line, idx, opts);
	}

	const ratio = (src2 - src1 > 0) ? (line - src1) / (src2 - src1) : 0;
	return targetClamp(dst1 + ratio * (dst2 - dst1));
}

/**
 * Maps a continuous line number from one side of a chunk array to the other.
 */
function mapLineAcrossChunks(line: number, opts: MappingOptions): number {
	const { sourceMaxLines, smooth } = opts;
	const clampedLine = Math.max(0, Math.min(line, sourceMaxLines - 1e-10));
	const targetClamp = (val: number) => Math.max(0, Math.min(val, opts.targetMaxLines - 1e-10));

	if (smooth) {
		return _mapLineSmooth(clampedLine, opts, targetClamp);
	}
	return _mapLineDiscrete(clampedLine, opts);
}

/**
 * Maps a continuous line number across n panes (0 to n-1).
 */
function mapLineAcrossPanes(
	sourceLine: number,
	sourceIdx: number,
	targetIdx: number,
	ctx: PaneMappingContext,
): number {
	const { diffs, paneLineCounts, smooth, diffIsReversed } = ctx;
	if (sourceIdx === targetIdx) {
		return sourceLine;
	}

	const step = sourceIdx < targetIdx ? 1 : -1;
	const nextIdx = sourceIdx + step;

	const diffIdx = Math.min(sourceIdx, nextIdx);
	const chunks = diffs[diffIdx];
	if (!chunks) {
		return mapLineAcrossPanes(sourceLine, nextIdx, targetIdx, ctx);
	}

	const sourceIsA = (step === 1) ? !diffIsReversed[diffIdx] : diffIsReversed[diffIdx];

	const targetLine = mapLineAcrossChunks(sourceLine, {
		chunks,
		sourceMaxLines: paneLineCounts[sourceIdx],
		targetMaxLines: paneLineCounts[nextIdx],
		sourceIsA,
		smooth,
	});

	return mapLineAcrossPanes(targetLine, nextIdx, targetIdx, ctx);
}

export type { MappingOptions, PaneMappingContext };
export { mapLineAcrossChunks, mapLineAcrossPanes };
