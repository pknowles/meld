import { mapLineAcrossPanes } from "./scrollMapping";
import type { DiffChunk } from "./types";

describe("5-Pane Scroll Mapping Regression Test", () => {
	// The setup that caused the bug:
	// Pane 1 (Local): 10 lines
	// Pane 2 (Merged): 100 lines
	// diffs[1] (Local-Merged)
	// BY CONVENTION: diffs[i].sideA is pane[i] and diffs[i].sideB is pane[i+1].
	// So diffs[1] should have A=Local(10 lines), B=Merged(100 lines).

	const paneCounts = [100, 10, 100, 10, 100]; // Base, Local, Merged, Remote, BaseR

	// Normalized diff: A is left (Local), B is right (Merged)
	const diffsNormalized: (DiffChunk[] | null)[] = [
		null, // diffs[0] (Base - Local)
		[{ tag: "replace", start_a: 0, end_a: 10, start_b: 0, end_b: 100 }], // diffs[1] (Local - Merged)
		null, // diffs[2] (Merged - Remote)
		null, // diffs[3] (Remote - BaseR)
	];

	it("should map from Local to Merged correctly when normalized", () => {
		const sourceIdx = 1; // Local
		const targetIdx = 2; // Merged
		const sourceLine = 5; // Middle of Local (50%)

		const result = mapLineAcrossPanes(
			sourceLine,
			sourceIdx,
			targetIdx,
			diffsNormalized,
			paneCounts,
			true,
		);

		expect(result).toBeCloseTo(50, 0);
	});

	it("should map backwards (Merged to Local) correctly when normalized", () => {
		const sourceIdx = 2; // Merged
		const targetIdx = 1; // Local
		const sourceLine = 50; // Middle of Merged (50%)

		const result = mapLineAcrossPanes(
			sourceLine,
			sourceIdx,
			targetIdx,
			diffsNormalized,
			paneCounts,
			true,
		);

		expect(result).toBeCloseTo(5, 0);
	});

	it("handles mapping into a single-line file side gracefully", () => {
		const emptyDiffs: (DiffChunk[] | null)[] = [
			null,
			[{ tag: "delete", start_a: 0, end_a: 0, start_b: 0, end_b: 10 }], // A=Local(0 lines), B=Merged(10 lines)
			null,
			null,
		];
		const counts = [10, 1, 10, 10, 10]; // 1 line minimum for "empty"

		const res = mapLineAcrossPanes(5, 2, 1, emptyDiffs, counts, true);
		expect(res).toBeLessThan(1);
		expect(res).toBeGreaterThanOrEqual(0);
	});

	it("handles multiple chunks across panes", () => {
		const complexDiffs: (DiffChunk[] | null)[] = [
			null,
			[
				{ tag: "replace", start_a: 0, end_a: 10, start_b: 0, end_b: 50 },
				{ tag: "equal", start_a: 10, end_a: 20, start_b: 50, end_b: 60 },
				{ tag: "replace", start_a: 20, end_a: 30, start_b: 60, end_b: 100 },
			],
			[{ tag: "equal", start_a: 0, end_a: 100, start_b: 0, end_b: 100 }],
			null,
		];
		const counts = [100, 30, 100, 100, 100];

		// Complex case: Local(1) to Remote(3) through Merged(2)
		// Line 15 in Local(1) is in the "equal" chunk (lines 10-20).
		// That maps to 15-10 + 50 = 55 in Merged(2).
		// Merged(2) to Remote(3) is 1:1.
		const res = mapLineAcrossPanes(15, 1, 3, complexDiffs, counts, true);
		expect(res).toBeCloseTo(55, 0);
	});
});
