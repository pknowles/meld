import type { editor } from "monaco-editor";
import * as React from "react";
import type { DiffChunk } from "./types";

export const useSynchronizedScrolling = (
	editorRefs: React.MutableRefObject<editor.IStandaloneCodeEditor[]>,
	diffsRef: React.MutableRefObject<(DiffChunk[] | null)[]>,
	setRenderTrigger: React.Dispatch<React.SetStateAction<number>>,
) => {
	const syncingFrom = React.useRef<number | null>(null);

	const attachScrollListener = React.useCallback(
		(ed: editor.IStandaloneCodeEditor, edIndex: number) => {
			return ed.onDidScrollChange((e: import("monaco-editor").IScrollEvent) => {
				setRenderTrigger((prev) => prev + 1);

				if (syncingFrom.current !== null && syncingFrom.current !== edIndex)
					return;

				const dRef = diffsRef.current;

				const mapLineWithDiff = (
					sLine: number,
					diff: DiffChunk[] | null,
					sourceIsA: boolean,
					tIndex: number,
				): number => {
					const maxLines =
						editorRefs.current[tIndex]?.getModel()?.getLineCount() || 1;

					if (!diff || diff.length === 0) return Math.min(sLine, maxLines);
					let lastChunk = diff[0];
					for (const chunk of diff) {
						const sStart = sourceIsA ? chunk.start_a : chunk.start_b;
						const sEnd = sourceIsA ? chunk.end_a : chunk.end_b;
						const tStart = sourceIsA ? chunk.start_b : chunk.start_a;
						const tEnd = sourceIsA ? chunk.end_b : chunk.end_a;

						if (sLine >= sStart && sLine < sEnd) {
							if (chunk.tag === "equal") {
								return Math.min(tStart + (sLine - sStart), maxLines);
							}
							const sLen = sEnd - sStart;
							const tLen = tEnd - tStart;
							const ratio = sLen > 0 ? (sLine - sStart) / sLen : 0;
							return Math.min(tStart + ratio * tLen, maxLines);
						}
						lastChunk = chunk;
					}
					const sEnd = sourceIsA ? lastChunk.end_a : lastChunk.end_b;
					const tEnd = sourceIsA ? lastChunk.end_b : lastChunk.end_a;
					return Math.min(tEnd + (sLine - sEnd), maxLines);
				};

				// Maps immediately adjacent panes
				const mapAdjacentLine = (
					sLine: number,
					sIdx: number,
					tIdx: number,
				): number => {
					// 0: Base(L), 1: Local, 2: Merged, 3: Remote, 4: Base(R)
					// Diffs: [0] Base<->Local, [1] Local<->Merged, [2] Merged<->Remote, [3] Remote<->Base

					// Base(L) -> Local. Diff [0] has Base=a, Local=b
					if (sIdx === 0 && tIdx === 1)
						return mapLineWithDiff(sLine, dRef[0], true, 1);
					if (sIdx === 1 && tIdx === 0)
						return mapLineWithDiff(sLine, dRef[0], false, 0);

					// Local -> Merged. Diff [1] receives Merged(a) and Local(b) from Differ
					if (sIdx === 1 && tIdx === 2)
						return mapLineWithDiff(sLine, dRef[1], false, 2);
					if (sIdx === 2 && tIdx === 1)
						return mapLineWithDiff(sLine, dRef[1], true, 1);

					// Merged -> Remote. Diff [2] receives Merged(a) and Remote(b)
					if (sIdx === 2 && tIdx === 3)
						return mapLineWithDiff(sLine, dRef[2], true, 3);
					if (sIdx === 3 && tIdx === 2)
						return mapLineWithDiff(sLine, dRef[2], false, 2);

					// Remote -> Base(R). Diff [3] has Remote=a, Base(R)=b
					if (sIdx === 3 && tIdx === 4)
						return mapLineWithDiff(sLine, dRef[3], true, 4);
					if (sIdx === 4 && tIdx === 3)
						return mapLineWithDiff(sLine, dRef[3], false, 3);

					return sLine;
				};

				// Recursive mapping for any two panes
				const mapLine = (sLine: number, sIdx: number, tIdx: number): number => {
					if (sIdx === tIdx) return sLine;

					// Move one step towards the target index
					const nextIdx = sIdx < tIdx ? sIdx + 1 : sIdx - 1;
					const nextLine = mapAdjacentLine(sLine, sIdx, nextIdx);

					return mapLine(nextLine, nextIdx, tIdx);
				};

				if (e.scrollTopChanged) {
					let lineHeight =
						ed.getTopForLineNumber(2) - ed.getTopForLineNumber(1);
					if (lineHeight <= 0) lineHeight = 19;
					const sourceLine = Math.max(0, e.scrollTop) / lineHeight;

					syncingFrom.current = edIndex;
					editorRefs.current.forEach((otherEditor, i) => {
						if (i !== edIndex && otherEditor) {
							const targetLine = mapLine(sourceLine, edIndex, i);
							const targetScrollTop = targetLine * lineHeight;
							if (Math.abs(otherEditor.getScrollTop() - targetScrollTop) > 2) {
								otherEditor.setScrollTop(targetScrollTop);
							}
						}
					});
					syncingFrom.current = null;
				}

				if (e.scrollLeftChanged) {
					syncingFrom.current = edIndex;
					editorRefs.current.forEach((otherEditor, i) => {
						if (i !== edIndex && otherEditor) {
							if (Math.abs(otherEditor.getScrollLeft() - e.scrollLeft) > 2) {
								otherEditor.setScrollLeft(e.scrollLeft);
							}
						}
					});
					syncingFrom.current = null;
				}
			});
		},
		[diffsRef, editorRefs, setRenderTrigger],
	);

	return { attachScrollListener };
};
