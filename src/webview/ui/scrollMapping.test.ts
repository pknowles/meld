import { mapLineAcrossChunks, mapLineAcrossPanes } from "./scrollMapping";
import type { DiffChunk } from "./types";

describe("mapLineAcrossChunks", () => {
	it("maps 1:1 when chunks are null or empty", () => {
		expect(mapLineAcrossChunks(5.5, null, true, 20, 20, true)).toBe(5.5);
		expect(mapLineAcrossChunks(3.1, [], false, 20, 20, false)).toBe(3.1);
	});

	it("clamps to target boundaries when provided", () => {
		expect(mapLineAcrossChunks(10.5, null, true, 20, 5, false)).toBe(5);
		expect(mapLineAcrossChunks(10, null, true, 20, 5, false)).toBe(5);
	});

	describe("with replace chunks", () => {
		const chunks: DiffChunk[] = [
			{ tag: "equal", start_a: 0, end_a: 2, start_b: 0, end_b: 2 },
			{ tag: "replace", start_a: 2, end_a: 6, start_b: 2, end_b: 10 },
			{ tag: "equal", start_a: 6, end_a: 8, start_b: 10, end_b: 12 },
		];

		it("interpolates proportionally through replace chunk", () => {
			expect(mapLineAcrossChunks(4, chunks, true, 10, 15, true)).toBe(6);
			expect(mapLineAcrossChunks(6, chunks, false, 15, 10, true)).toBe(4);
		});

		it("maps correctly before the first asymmetric chunk", () => {
			expect(mapLineAcrossChunks(1, chunks, true, 10, 15, true)).toBe(1);
			expect(mapLineAcrossChunks(1, chunks, false, 15, 10, true)).toBe(1);
		});
	});

	describe("with insert chunks", () => {
		const chunks: DiffChunk[] = [
			{ tag: "equal", start_a: 0, end_a: 5, start_b: 0, end_b: 5 },
			{ tag: "insert", start_a: 5, end_a: 5, start_b: 5, end_b: 15 },
		];

		it("maps lines after insert shifted by insert size (unsmoothed)", () => {
			expect(mapLineAcrossChunks(6, chunks, true, 20, 30, false)).toBe(16);
			expect(mapLineAcrossChunks(16, chunks, false, 30, 20, false)).toBe(6);
		});

		it("maps inside insert proportionally", () => {
			expect(mapLineAcrossChunks(10, chunks, false, 30, 20, false)).toBe(5);
		});
	});

	describe("with delete chunks", () => {
		const chunks: DiffChunk[] = [
			{ tag: "equal", start_a: 0, end_a: 5, start_b: 0, end_b: 5 },
			{ tag: "delete", start_a: 5, end_a: 15, start_b: 5, end_b: 5 },
		];

		it("maps lines after delete shifted backwards (unsmoothed)", () => {
			expect(mapLineAcrossChunks(16, chunks, true, 30, 20, false)).toBe(6);
			expect(mapLineAcrossChunks(6, chunks, false, 20, 30, false)).toBe(16);
		});

		it("maps inside delete proportionally", () => {
			expect(mapLineAcrossChunks(10, chunks, true, 30, 20, false)).toBeCloseTo(
				5,
			);
		});
	});

	describe("large disproportionate chunks", () => {
		it("smoothly interpolates through insert boundary (no jumps)", () => {
			const chunks: DiffChunk[] = [
				{ tag: "insert", start_a: 5, end_a: 5, start_b: 5, end_b: 15 },
			];

			const EPS = 1e-6;
			for (let x = 3; x <= 4.9; x += 0.25) {
				const val = mapLineAcrossChunks(x, chunks, true, 20, 30, true);
				const valNext = mapLineAcrossChunks(
					x + EPS,
					chunks,
					true,
					20,
					30,
					true,
				);
				expect(Math.abs(valNext - val)).toBeLessThan(1.0);
			}
			for (let x = 3; x <= 17; x += 0.5) {
				const val = mapLineAcrossChunks(x, chunks, false, 30, 20, true);
				const valNext = mapLineAcrossChunks(
					x + EPS,
					chunks,
					false,
					30,
					20,
					true,
				);
				expect(Math.abs(valNext - val)).toBeLessThan(1.0);
			}
		});

		it("smoothly interpolates through delete boundary (no jumps)", () => {
			const chunks: DiffChunk[] = [
				{ tag: "delete", start_a: 6, end_a: 16, start_b: 6, end_b: 6 },
			];

			const EPS = 1e-6;
			for (let x = 4; x <= 18; x += 0.5) {
				const val = mapLineAcrossChunks(x, chunks, true, 30, 20, true);
				const valNext = mapLineAcrossChunks(
					x + EPS,
					chunks,
					true,
					30,
					20,
					true,
				);
				expect(Math.abs(valNext - val)).toBeLessThan(1.0);
			}
			for (let x = 4; x <= 8; x += 0.25) {
				const val = mapLineAcrossChunks(x, chunks, false, 20, 30, true);
				const valNext = mapLineAcrossChunks(
					x + EPS,
					chunks,
					false,
					20,
					30,
					true,
				);
				expect(Math.abs(valNext - val)).toBeLessThan(1.0);
			}
		});

		it("maps smoothly from 1000 lines to 1 line without throwing", () => {
			const chunks: DiffChunk[] = [
				{ tag: "replace", start_a: 5, end_a: 1005, start_b: 5, end_b: 6 },
			];

			mapLineAcrossChunks(5, chunks, true, 1100, 100, true);
			mapLineAcrossChunks(505, chunks, true, 1100, 100, true);
			mapLineAcrossChunks(1004, chunks, true, 1100, 100, true);
		});
	});

	describe("file extending beyond last chunk", () => {
		it("maps 1:1 using the last chunk's offset at the end of the file", () => {
			const chunks: DiffChunk[] = [
				{ tag: "replace", start_a: 10, end_a: 15, start_b: 10, end_b: 20 },
			];
			const sMax = 100;
			const tMax = 105;

			expect(mapLineAcrossChunks(20, chunks, true, sMax, tMax, false)).toBe(25);
			expect(mapLineAcrossChunks(90, chunks, true, sMax, tMax, false)).toBe(95);

			const smoothRes = mapLineAcrossChunks(90, chunks, true, sMax, tMax, true);
			expect(smoothRes).toBeGreaterThan(90);
			expect(smoothRes).toBeLessThan(105);
		});
	});
});

describe("mapLineAcrossPanes", () => {
	it("walks the chain smoothly (no jumps)", () => {
		const diffs: (DiffChunk[] | null)[] = [
			[{ tag: "insert", start_a: 0, end_a: 0, start_b: 0, end_b: 10 }],
			[{ tag: "equal", start_a: 0, end_a: 30, start_b: 0, end_b: 30 }],
		];
		const counts = [20, 30, 30];

		const eIn = 1e-8;
		const eOut = 1e-6;
		for (let x = 0; x < 20; x++) {
			const val = mapLineAcrossPanes(
				Math.max(0, x - eIn),
				0,
				2,
				diffs,
				counts,
				true,
			);
			const valNext = mapLineAcrossPanes(x + eIn, 0, 2, diffs, counts, true);
			expect(Math.abs(valNext - val)).toBeLessThan(eOut);
		}
		for (let x = 0; x < 30; x++) {
			const val = mapLineAcrossPanes(
				Math.max(0, x - eIn),
				2,
				0,
				diffs,
				counts,
				true,
			);
			const valNext = mapLineAcrossPanes(x + eIn, 2, 0, diffs, counts, true);
			expect(Math.abs(valNext - val)).toBeLessThan(eOut);
		}
	});

	it("handles null diffs in chain without crashing", () => {
		const diffs: (DiffChunk[] | null)[] = [
			[{ tag: "insert", start_a: 0, end_a: 0, start_b: 0, end_b: 10 }],
			null,
		];

		const result = mapLineAcrossPanes(5, 0, 2, diffs, [20, 30, 30], true);
		expect(Number.isFinite(result)).toBe(true);
		expect(result).toBeGreaterThanOrEqual(0);
	});
});

describe("complex multi-pane scenarios", () => {
	const complexDiffs: (DiffChunk[] | null)[] = [
		[
			{ tag: "equal", start_a: 0, end_a: 5, start_b: 0, end_b: 5 },
			{ tag: "insert", start_a: 5, end_a: 5, start_b: 5, end_b: 15 },
			{ tag: "equal", start_a: 5, end_a: 10, start_b: 15, end_b: 20 },
			{ tag: "replace", start_a: 10, end_a: 15, start_b: 20, end_b: 30 },
			{ tag: "delete", start_a: 15, end_a: 20, start_b: 30, end_b: 30 },
		],
		[
			{ tag: "equal", start_a: 0, end_a: 10, start_b: 0, end_b: 10 },
			{ tag: "replace", start_a: 10, end_a: 20, start_b: 10, end_b: 15 },
			{ tag: "equal", start_a: 20, end_a: 35, start_b: 15, end_b: 30 },
		],
		[
			{ tag: "delete", start_a: 0, end_a: 5, start_b: 0, end_b: 0 },
			{ tag: "equal", start_a: 5, end_a: 15, start_b: 0, end_b: 10 },
			{ tag: "replace", start_a: 15, end_a: 20, start_b: 10, end_b: 12 },
			{ tag: "equal", start_a: 20, end_a: 30, start_b: 12, end_b: 22 },
			{ tag: "insert", start_a: 30, end_a: 30, start_b: 22, end_b: 25 },
		],
		[
			{ tag: "equal", start_a: 0, end_a: 5, start_b: 0, end_b: 5 },
			{ tag: "replace", start_a: 5, end_a: 15, start_b: 5, end_b: 25 },
			{ tag: "delete", start_a: 15, end_a: 20, start_b: 25, end_b: 25 },
			{ tag: "equal", start_a: 20, end_a: 25, start_b: 25, end_b: 30 },
		],
	];
	const complexCounts = [25, 35, 30, 25, 30];

	it("verifies scrolling all the way to the top and bottom results in all other panels hitting top and bottom relative mappings", () => {
		for (let sIdx = 0; sIdx < 5; sIdx++) {
			for (let tIdx = 0; tIdx < 5; tIdx++) {
				if (sIdx === tIdx) continue;

				const topRes = mapLineAcrossPanes(
					0,
					sIdx,
					tIdx,
					complexDiffs,
					complexCounts,
					true,
				);
				expect(topRes).toBeGreaterThanOrEqual(0);

				const botRes = mapLineAcrossPanes(
					complexCounts[sIdx],
					sIdx,
					tIdx,
					complexDiffs,
					complexCounts,
					true,
				);
				expect(botRes).toBeLessThanOrEqual(complexCounts[tIdx]);
			}
		}
	});

	it("verifies delete regions are continuous (no snapping)", () => {
		const EPS = 1e-6;
		for (let x = 13; x <= 22; x += 0.5) {
			const val = mapLineAcrossPanes(
				x,
				0,
				1,
				complexDiffs,
				complexCounts,
				true,
			);
			const valNext = mapLineAcrossPanes(
				x + EPS,
				0,
				1,
				complexDiffs,
				complexCounts,
				true,
			);
			expect(Math.abs(valNext - val)).toBeLessThan(1.0);
		}
	});

	it("verifies insert regions are continuous (no jumping)", () => {
		const EPS = 1e-6;
		for (let x = 3; x <= 8; x += 0.25) {
			const val = mapLineAcrossPanes(
				x,
				0,
				1,
				complexDiffs,
				complexCounts,
				true,
			);
			const valNext = mapLineAcrossPanes(
				x + EPS,
				0,
				1,
				complexDiffs,
				complexCounts,
				true,
			);
			expect(Math.abs(valNext - val)).toBeLessThan(1.0);
		}
	});

	it("verifies scrolling is continuous (no sudden jumps) across all chunk boundaries", () => {
		const EPSILON = 1e-6;
		const MAX_DELTA = 1.0;

		for (let sIdx = 0; sIdx < 5; sIdx++) {
			const boundaries = new Set<number>();
			boundaries.add(0);
			boundaries.add(complexCounts[sIdx]);

			if (sIdx < 4) {
				const rDiffs = complexDiffs[sIdx];
				if (rDiffs) {
					for (const d of rDiffs) {
						boundaries.add(d.start_a);
						boundaries.add(d.end_a);
					}
				}
			}
			if (sIdx > 0) {
				const lDiffs = complexDiffs[sIdx - 1];
				if (lDiffs) {
					for (const d of lDiffs) {
						boundaries.add(d.start_b);
						boundaries.add(d.end_b);
					}
				}
			}

			const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

			for (let tIdx = 0; tIdx < 5; tIdx++) {
				if (sIdx === tIdx) continue;

				for (const bound of sortedBoundaries) {
					const valAtBoundary = mapLineAcrossPanes(
						bound,
						sIdx,
						tIdx,
						complexDiffs,
						complexCounts,
						true,
					);

					if (bound - EPSILON >= 0) {
						const valBefore = mapLineAcrossPanes(
							bound - EPSILON,
							sIdx,
							tIdx,
							complexDiffs,
							complexCounts,
							true,
						);
						expect(Math.abs(valAtBoundary - valBefore)).toBeLessThan(MAX_DELTA);
					}

					if (bound + EPSILON <= complexCounts[sIdx]) {
						const valAfter = mapLineAcrossPanes(
							bound + EPSILON,
							sIdx,
							tIdx,
							complexDiffs,
							complexCounts,
							true,
						);
						expect(Math.abs(valAfter - valAtBoundary)).toBeLessThan(MAX_DELTA);
					}
				}
			}
		}
	});
});
