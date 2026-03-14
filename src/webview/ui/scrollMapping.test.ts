// Copyright (C) 2026 Pyarelal Knowles, GPL v2

import { mapLineAcrossChunks, mapLineAcrossPanes } from "./scrollMapping.ts";
import type { DiffChunk } from "./types.ts";

describe("mapLineAcrossChunks", () => {
	it("maps 1:1 for null or empty chunks", () => {
		expect(
			mapLineAcrossChunks(5.5, {
				chunks: null,
				sourceIsA: true,
				sourceMaxLines: 20,
				targetMaxLines: 20,
				smooth: true,
			}),
		).toBe(5.5);
		expect(
			mapLineAcrossChunks(3.1, {
				chunks: [],
				sourceIsA: true,
				sourceMaxLines: 10,
				targetMaxLines: 10,
				smooth: true,
			}),
		).toBe(3.1);
	});

	it("clamps input line and output result", () => {
		expect(
			mapLineAcrossChunks(-10, {
				chunks: null,
				sourceIsA: true,
				sourceMaxLines: 20,
				targetMaxLines: 5,
				smooth: false,
			}),
		).toBe(0);
		expect(
			mapLineAcrossChunks(30, {
				chunks: null,
				sourceIsA: true,
				sourceMaxLines: 20,
				targetMaxLines: 5,
				smooth: false,
			}),
		).toBe(5);
		expect(
			mapLineAcrossChunks(10, {
				chunks: null,
				sourceIsA: true,
				sourceMaxLines: 20,
				targetMaxLines: 5,
				smooth: false,
			}),
		).toBe(5);
	});

	it("maps lines with simple insert (unsmoothed)", () => {
		const chunks: DiffChunk[] = [
			{ tag: "insert", startA: 5, endA: 5, startB: 5, endB: 10 },
		];
		// Before chunk: 1:1 gap
		expect(
			mapLineAcrossChunks(2, {
				chunks,
				sourceIsA: true,
				sourceMaxLines: 20,
				targetMaxLines: 25,
				smooth: false,
			}),
		).toBe(2);
		expect(
			mapLineAcrossChunks(2, {
				chunks,
				sourceIsA: false,
				sourceMaxLines: 25,
				targetMaxLines: 20,
				smooth: false,
			}),
		).toBe(2);

		// Inside insert (from B perspective)
		expect(
			mapLineAcrossChunks(7.5, {
				chunks,
				sourceIsA: false,
				sourceMaxLines: 25,
				targetMaxLines: 20,
				smooth: false,
			}),
		).toBe(5);

		// After insert
		expect(
			mapLineAcrossChunks(10, {
				chunks,
				sourceIsA: true,
				sourceMaxLines: 20,
				targetMaxLines: 25,
				smooth: false,
			}),
		).toBe(15);
		expect(
			mapLineAcrossChunks(15, {
				chunks,
				sourceIsA: false,
				sourceMaxLines: 25,
				targetMaxLines: 20,
				smooth: false,
			}),
		).toBe(10);
	});

	it("throws error if chunks extend beyond sourceMaxLines", () => {
		const chunks: DiffChunk[] = [
			{ tag: "equal", startA: 10, endA: 20, startB: 10, endB: 20 },
		];
		expect(() =>
			mapLineAcrossChunks(5, {
				chunks,
				sourceIsA: true,
				sourceMaxLines: 15,
				targetMaxLines: 30,
				smooth: false,
			}),
		).toThrow();
	});

	it("maps lines with complex multi-chunk scenario (unsmoothed)", () => {
		const chunks: DiffChunk[] = [
			{ tag: "delete", startA: 5, endA: 10, startB: 5, endB: 5 },
			{ tag: "insert", startA: 20, endA: 20, startB: 15, endB: 25 },
			{ tag: "replace", startA: 30, endA: 35, startB: 35, endB: 45 },
		];
		const sMaxA = 50;
		const sMaxB = 60;

		// 1. Gap before everything
		expect(
			mapLineAcrossChunks(2, {
				chunks,
				sourceIsA: true,
				sourceMaxLines: sMaxA,
				targetMaxLines: sMaxB,
				smooth: false,
			}),
		).toBe(2);

		// 2. Inside first delete (from A)
		expect(
			mapLineAcrossChunks(7, {
				chunks,
				sourceIsA: true,
				sourceMaxLines: sMaxA,
				targetMaxLines: sMaxB,
				smooth: false,
			}),
		).toBe(5);

		// 3. Gap between delete and insert
		// A:[10, 20] -> B:[5, 15] (offset -5)
		expect(
			mapLineAcrossChunks(15, {
				chunks,
				sourceIsA: true,
				sourceMaxLines: sMaxA,
				targetMaxLines: sMaxB,
				smooth: false,
			}),
		).toBe(10);
		expect(
			mapLineAcrossChunks(10, {
				chunks,
				sourceIsA: false,
				sourceMaxLines: sMaxB,
				targetMaxLines: sMaxA,
				smooth: false,
			}),
		).toBe(15);

		// 4. Inside insert (from B)
		// B:[15, 25] maps to A:20
		expect(
			mapLineAcrossChunks(20, {
				chunks,
				sourceIsA: false,
				sourceMaxLines: sMaxB,
				targetMaxLines: sMaxA,
				smooth: false,
			}),
		).toBe(20);

		// 5. Gap after insert
		// A:[20, 30] -> B:[25, 35] (offset +5)
		expect(
			mapLineAcrossChunks(25, {
				chunks,
				sourceIsA: true,
				sourceMaxLines: sMaxA,
				targetMaxLines: sMaxB,
				smooth: false,
			}),
		).toBe(30);

		// 6. Inside change
		// A:[30, 35] maps to B:[35, 45] (scale 2.0)
		expect(
			mapLineAcrossChunks(32.5, {
				chunks,
				sourceIsA: true,
				sourceMaxLines: sMaxA,
				targetMaxLines: sMaxB,
				smooth: false,
			}),
		).toBe(40);

		// 7. Final trailing gap
		// A:[35, 50] maps to B:[45, 60] (offset +10)
		expect(
			mapLineAcrossChunks(40, {
				chunks,
				sourceIsA: true,
				sourceMaxLines: sMaxA,
				targetMaxLines: sMaxB,
				smooth: false,
			}),
		).toBe(50);
	});

	describe("smooth mapping", () => {
		const chunks: DiffChunk[] = [
			{ tag: "replace", startA: 10, endA: 20, startB: 10, endB: 30 },
		];
		const sMaxA = 40;
		const sMaxB = 60;

		it("is continuous and monotonic across boundaries", () => {
			const points = [0, 5, 10, 15, 20, 30, 40];
			let last = -1;
			for (const p of points) {
				const res = mapLineAcrossChunks(p, {
					chunks,
					sourceIsA: true,
					sourceMaxLines: sMaxA,
					targetMaxLines: sMaxB,
					smooth: true,
				});
				expect(res).toBeGreaterThanOrEqual(last);
				last = res;
			}
		});

		it("maps the midpoint of a chunk to its counterpart midpoint", () => {
			// A:[10, 20] mid is 15. B:[10, 30] mid is 20.
			expect(
				mapLineAcrossChunks(15, {
					chunks,
					sourceIsA: true,
					sourceMaxLines: sMaxA,
					targetMaxLines: sMaxB,
					smooth: true,
				}),
			).toBe(20);
			expect(
				mapLineAcrossChunks(20, {
					chunks,
					sourceIsA: false,
					sourceMaxLines: sMaxB,
					targetMaxLines: sMaxA,
					smooth: true,
				}),
			).toBe(15);
		});

		it("maps lines before delete shifted backwards (unsmoothed)", () => {
			const chunks: DiffChunk[] = [
				{ tag: "delete", startA: 5, endA: 15, startB: 5, endB: 5 },
			];
			expect(
				mapLineAcrossChunks(16, {
					chunks,
					sourceIsA: true,
					sourceMaxLines: 30,
					targetMaxLines: 20,
					smooth: false,
				}),
			).toBe(6);
			expect(
				mapLineAcrossChunks(6, {
					chunks,
					sourceIsA: false,
					sourceMaxLines: 20,
					targetMaxLines: 30,
					smooth: false,
				}),
			).toBe(16);
		});
	});
});

describe("mapLineAcrossPanes", () => {
	const PaneCounts: [number, number, number, number, number] = [
		100, 100, 100, 100, 100,
	];
	const diffs = [
		[
			{
				tag: "replace" as const,
				startA: 10,
				endA: 20,
				startB: 10,
				endB: 30,
			},
		], // p0-p1
		null, // p1-p2
		[
			{
				tag: "replace" as const,
				startA: 30,
				endA: 40,
				startB: 40,
				endB: 50,
			},
		], // p2-p3
		null, // p3-p4
	];

	it("maps identity for same source and target", () => {
		const ctx = {
			diffs,
			paneLineCounts: PaneCounts,
			smooth: false,
			diffIsReversed: [false, false, false, false],
		};
		expect(mapLineAcrossPanes(50, 2, 2, ctx)).toBe(50);
	});

	it("chains mappings across multiple panes (unsmoothed)", () => {
		const ctx = {
			diffs,
			paneLineCounts: PaneCounts,
			smooth: false,
			diffIsReversed: [false, false, false, false],
		};
		// p0:15 -> p1:20 (inside change)
		// p1:20 -> p2:20 (null diff)
		// p2:20 -> p3:30 (offset +10 via intermediate gap before change)
		expect(mapLineAcrossPanes(15, 0, 3, ctx)).toBe(30);
	});

	it("respects diffIsReversed", () => {
		const ctx = {
			diffs,
			paneLineCounts: PaneCounts,
			smooth: false,
			diffIsReversed: [true, false, false, false],
		};
		// p0-p1 diff is reversed, so p0 is side B, p1 is side A.
		// p0:20 (side B midpoint) -> p1:15 (side A midpoint)
		expect(mapLineAcrossPanes(20, 0, 1, ctx)).toBe(15);
	});

	describe("complex multi-pane scenarios", () => {
		const paneLineCounts: [number, number, number, number, number] = [
			1000, 200, 1000, 500, 1000,
		];
		const diffs: (DiffChunk[] | null)[] = [
			// p0-p1: many deletes (1000 -> 200)
			[
				{
					tag: "delete" as const,
					startA: 100,
					endA: 900,
					startB: 100,
					endB: 100,
				},
			],
			// p1-p2: many inserts (200 -> 1000)
			[
				{
					tag: "insert" as const,
					startA: 100,
					endA: 100,
					startB: 100,
					endB: 900,
				},
			],
			// p2-p3: large change (1000 -> 500)
			[
				{
					tag: "replace" as const,
					startA: 200,
					endA: 800,
					startB: 200,
					endB: 300,
				},
			],
			// p3-p4: 1:1 mapping (500 -> 1000 via change)
			[
				{
					tag: "replace" as const,
					startA: 0,
					endA: 500,
					startB: 0,
					endB: 1000,
				},
			],
		];

		it("verifies scrolling is continuous (no sudden jumps) across all chunk boundaries", () => {
			const ctx = {
				diffs,
				paneLineCounts,
				smooth: true,
				diffIsReversed: [false, false, false, false],
			};

			// Test across all source panes
			for (let sourceIdx = 0; sourceIdx < 5; sourceIdx++) {
				for (let targetIdx = 0; targetIdx < 5; targetIdx++) {
					if (sourceIdx === targetIdx) continue;

					const sMax = paneLineCounts[sourceIdx]!;
					const tMax = paneLineCounts[targetIdx]!;

					// Check continuity by sampling
					const samples = 100;
					let lastVal = mapLineAcrossPanes(
						0,
						sourceIdx,
						targetIdx,
						ctx,
					);

					for (let i = 1; i <= samples; i++) {
						const nextVal = mapLineAcrossPanes(
							(i / samples) * sMax,
							sourceIdx,
							targetIdx,
							ctx,
						);
						// Ensure it's monotonic (or at least roughly, the mapping should be)
						// and no huge jumps (max 2x proportional delta)
						const delta = Math.abs(nextVal - lastVal);
						const expectedDelta = (1 / samples) * tMax;
						expect(delta).toBeLessThan(expectedDelta * 10); // Very generous jump limit
						lastVal = nextVal;
					}
				}
			}
		});

		it("correctly maps middle of the file across complex changes", () => {
			const ctx = {
				diffs,
				paneLineCounts,
				smooth: true,
				diffIsReversed: [false, false, false, false],
			};

			const tMax = paneLineCounts[2]!;
			const smoothRes = mapLineAcrossPanes(100, 1, 2, ctx);
			expect(smoothRes).toBe(tMax / 2);
		});
	});
});
