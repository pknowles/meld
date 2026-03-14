// Copyright (C) 2026 Pyarelal Knowles, GPL v2

import type { DiffChunk } from "./types.ts";

export interface MappingOptions {
	chunks: DiffChunk[] | null | undefined;
	sourceMaxLines: number;
	targetMaxLines: number;
	sourceIsA: boolean;
	smooth: boolean;
}

export interface PaneMappingContext {
	diffs: (DiffChunk[] | null)[];
	paneLineCounts: [number, number, number, number, number];
	smooth: boolean;
	diffIsReversed: boolean[];
}

function _sOf(chunk: DiffChunk, sourceIsA: boolean): [number, number] {
	return sourceIsA ? [chunk.startA, chunk.endA] : [chunk.startB, chunk.endB];
}

function _tOf(chunk: DiffChunk, sourceIsA: boolean): [number, number] {
	return sourceIsA ? [chunk.startB, chunk.endB] : [chunk.startA, chunk.endA];
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

function _interpolate(
	src: number,
	s1: number,
	s2: number,
	t1: number,
	t2: number,
): number {
	const ratio = s2 - s1 > 0 ? (src - s1) / (s2 - s1) : 0;
	return t1 + ratio * (t2 - t1);
}

function _upperBoundMid(
	chunks: DiffChunk[],
	line: number,
	sourceIsA: boolean,
): number {
	let low = 0;
	let high = chunks.length;
	while (low < high) {
		const mid = (low + high) >>> 1;
		if (_chunkSrcMid(chunks[mid]!, sourceIsA) <= line) {
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
	const cur = chunks[idx]!;
	const [sCurStart] = _sOf(cur, sourceIsA);
	const [tCurStart] = _tOf(cur, sourceIsA);

	if (idx === 0) {
		return [0, sCurStart, 0, tCurStart];
	}

	const prev = chunks[idx - 1]!;
	const [sPrevStart, sPrevEnd] = _sOf(prev, sourceIsA);
	const [tPrevStart, tPrevEnd] = _tOf(prev, sourceIsA);

	if (sCurStart > sPrevEnd) {
		return [sPrevEnd, sCurStart, tPrevEnd, tCurStart];
	}

	return [sPrevStart, sPrevEnd, tPrevStart, tPrevEnd];
}

function _getNextImplicitChunk(
	idx: number,
	chunks: DiffChunk[],
	sourceMaxLines: number,
	targetMaxLines: number,
	sourceIsA: boolean,
): [number, number, number, number] {
	const cur = chunks[idx]!;
	const [, sCurEnd] = _sOf(cur, sourceIsA);
	const [, tCurEnd] = _tOf(cur, sourceIsA);

	if (idx === chunks.length - 1) {
		return [sCurEnd, sourceMaxLines, tCurEnd, targetMaxLines];
	}

	const next = chunks[idx + 1]!;
	const [sNextStart, sNextEnd] = _sOf(next, sourceIsA);
	const [tNextStart, tNextEnd] = _tOf(next, sourceIsA);

	if (sNextStart > sCurEnd) {
		return [sCurEnd, sNextStart, tCurEnd, tNextStart];
	}

	return [sNextStart, sNextEnd, tNextStart, tNextEnd];
}

function _getGeneralInterpolationRanges(
	line: number,
	idx: number,
	opts: MappingOptions,
): [number, number, number, number] {
	const { chunks, sourceMaxLines, targetMaxLines, sourceIsA } = opts;
	const cur = chunks![idx]!;
	const [sStart] = _sOf(cur, sourceIsA);

	if (line < sStart) {
		const gap = _getPreviousImplicitChunk(idx, chunks!, sourceIsA);
		if (line < _implicitSrcMid(gap)) {
			const prev = idx > 0 ? chunks![idx - 1] : undefined;
			return [
				prev ? _chunkSrcMid(prev, sourceIsA) : 0,
				_implicitSrcMid(gap),
				prev ? _chunkDstMid(prev, sourceIsA) : 0,
				_implicitDstMid(gap),
			];
		}
		return [
			_implicitSrcMid(gap),
			_chunkSrcMid(cur, sourceIsA),
			_implicitDstMid(gap),
			_chunkDstMid(cur, sourceIsA),
		];
	}

	if (line < _chunkSrcMid(cur, sourceIsA)) {
		const gap = _getPreviousImplicitChunk(idx, chunks!, sourceIsA);
		return [
			_implicitSrcMid(gap),
			_chunkSrcMid(cur, sourceIsA),
			_implicitDstMid(gap),
			_chunkDstMid(cur, sourceIsA),
		];
	}

	const nextGap = _getNextImplicitChunk(
		idx,
		chunks!,
		sourceMaxLines,
		targetMaxLines,
		sourceIsA,
	);
	return [
		_chunkSrcMid(cur, sourceIsA),
		_implicitSrcMid(nextGap),
		_chunkDstMid(cur, sourceIsA),
		_implicitDstMid(nextGap),
	];
}

function _mapLineDiscrete(line: number, opts: MappingOptions): number {
	const { chunks, sourceIsA } = opts;
	let low = 0;
	let high = chunks!.length;
	while (low < high) {
		const mid = (low + high) >>> 1;
		if (_sOf(chunks![mid]!, sourceIsA)[0] <= line) {
			low = mid + 1;
		} else {
			high = mid;
		}
	}
	const idx = low;

	if (idx > 0) {
		const prev = chunks![idx - 1]!;
		const [, s2] = _sOf(prev, sourceIsA);
		if (line < s2) {
			const [s1] = _sOf(prev, sourceIsA);
			const [t1, t2] = _tOf(prev, sourceIsA);
			return _interpolate(line, s1, s2, t1, t2);
		}
	}

	if (idx < chunks!.length) {
		const gap = _getPreviousImplicitChunk(idx, chunks!, sourceIsA);
		return line + (gap[2] - gap[0]);
	}

	const last = chunks!.at(-1);
	if (last) {
		const [, sEnd] = _sOf(last, sourceIsA);
		const [, tEnd] = _tOf(last, sourceIsA);
		return line + (tEnd - sEnd);
	}

	return line;
}

function _mapLineSmooth(line: number, opts: MappingOptions): number {
	const { chunks, sourceMaxLines, targetMaxLines, sourceIsA } = opts;
	const idx = _upperBoundMid(chunks!, line, sourceIsA);

	let s1: number;
	let s2: number;
	let t1: number;
	let t2: number;

	if (idx === chunks!.length) {
		const last = chunks!.at(-1)!;
		const gap = _getNextImplicitChunk(
			chunks!.length - 1,
			chunks!,
			sourceMaxLines,
			targetMaxLines,
			sourceIsA,
		);
		if (line < _implicitSrcMid(gap)) {
			[s1, s2, t1, t2] = [
				_chunkSrcMid(last, sourceIsA),
				_implicitSrcMid(gap),
				_chunkDstMid(last, sourceIsA),
				_implicitDstMid(gap),
			];
		} else {
			[s1, s2, t1, t2] = [
				_implicitSrcMid(gap),
				sourceMaxLines,
				_implicitDstMid(gap),
				targetMaxLines,
			];
		}
	} else {
		[s1, s2, t1, t2] = _getGeneralInterpolationRanges(line, idx, opts);
	}

	let result = _interpolate(line, s1, s2, t1, t2);
	if (result >= targetMaxLines) {
		result = targetMaxLines - 1e-8;
	}
	return result;
}

/**
 * Maps a continuous line number from one side of a chunk array to the other.
 */
export function mapLineAcrossChunks(
	line: number,
	opts: MappingOptions,
): number {
	const { chunks, sourceMaxLines, targetMaxLines, smooth } = opts;
	const clampedLine = Math.max(0, Math.min(line, sourceMaxLines - 1e-10));
	const targetClamp = (val: number) =>
		Math.max(0, Math.min(val, targetMaxLines));

	if (!chunks || chunks.length === 0) {
		return targetClamp(clampedLine);
	}

	const last = chunks.at(-1);
	if (last) {
		const [, sEnd] = _sOf(last, opts.sourceIsA);
		if (sEnd > sourceMaxLines) {
			throw new Error("last chunk outside _sourceMaxLines");
		}
	}

	if (smooth) {
		return targetClamp(_mapLineSmooth(clampedLine, opts));
	}
	return targetClamp(_mapLineDiscrete(clampedLine, opts));
}

/**
 * Maps a continuous line number across n panes (0 to n-1).
 */
export function mapLineAcrossPanes(
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

	const sourceIsA =
		step === 1 ? !diffIsReversed[diffIdx] : !!diffIsReversed[diffIdx];

	const targetLine = mapLineAcrossChunks(sourceLine, {
		chunks,
		sourceMaxLines: paneLineCounts[sourceIdx]!,
		targetMaxLines: paneLineCounts[nextIdx]!,
		sourceIsA,
		smooth,
	});

	return mapLineAcrossPanes(targetLine, nextIdx, targetIdx, ctx);
}
