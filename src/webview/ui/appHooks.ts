import type { editor } from "monaco-editor";
import { useCallback, useEffect } from "react";
import { Differ } from "../../matchers/diffutil.ts";
import { applyChunkEdit, copyDownChunk, copyUpChunk, deleteChunk, getChunkText } from "./editorActions.ts";
import { processChunk } from "./highlightUtil.ts";
import type { BaseDiffPayload, DiffChunk, FileState, Highlight } from "./types.ts";
import { useVscodeMessageBus } from "./useVSCodeMessageBus.ts";

const splitLines = (text: string) => {
	const lines = text.split("\n");
	if (lines.length > 0 && lines.at(-1) === "") {
		lines.pop();
	}
	return lines;
};

const HACK_SYNC_DELAY = 100;

export type PaneFiles = [FileState | null, FileState | null, FileState | null, FileState | null, FileState | null];
export type PaneDiffs = [DiffChunk[] | null, DiffChunk[] | null, DiffChunk[] | null, DiffChunk[] | null];

interface MessageHandlersDeps {
	filesRef: React.MutableRefObject<PaneFiles>;
	diffsRef: React.MutableRefObject<PaneDiffs>;
	setFiles: (f: PaneFiles) => void;
	setDiffs: (d: PaneDiffs) => void;
	setExternalSyncId: (p: (id: number) => number) => void;
	setDebounceDelay: (d: number) => void;
	setSyntaxHighlighting: (s: boolean) => void;
	setBaseCompareHighlighting: (b: boolean) => void;
	setSmoothScrolling: (s: boolean) => void;
	setRenderTrigger: (p: (p: number) => number) => void;
	commitModelUpdate: (v: string) => void;
	resolveClipboardRead: (id: number, text: string) => void;
	vscodeApi: ReturnType<typeof useVscodeMessageBus>;
	differRef: React.MutableRefObject<Differ | null>;
}

function handleLoadDiff(m: any, p: MessageHandlersDeps) {
	const iF: PaneFiles = [null, m.data.files[0], m.data.files[1], m.data.files[2], null];
	const iD: PaneDiffs = [null, m.data.diffs[0], m.data.diffs[1], null];
	p.filesRef.current = iF;
	p.setFiles(iF);
	p.setDiffs(iD);
	p.diffsRef.current = iD;
	p.setExternalSyncId((id) => {
		return id + 1;
	});

	const config = m.data.config;
	if (config) {
		if (config.debounceDelay !== undefined) {
			p.setDebounceDelay(config.debounceDelay);
		}
		if (config.syntaxHighlighting !== undefined) {
			p.setSyntaxHighlighting(config.syntaxHighlighting);
		}
		if (config.baseCompareHighlighting !== undefined) {
			p.setBaseCompareHighlighting(config.baseCompareHighlighting);
		}
		if (config.smoothScrolling !== undefined) {
			p.setSmoothScrolling(config.smoothScrolling);
		}
	}

	const differ = new Differ();
	const dI = differ.setSequencesIter([
		splitLines(m.data.files[0].content),
		splitLines(m.data.files[1].content),
		splitLines(m.data.files[2].content),
	]);
	let s = dI.next();
	while (!s.done) {
		s = dI.next();
	}
	p.differRef.current = differ;
	setTimeout(() => {
		p.setRenderTrigger((prev) => {
			return prev + 1;
		});
	}, HACK_SYNC_DELAY);
}

function handleLoadBaseDiff(m: any, p: MessageHandlersDeps) {
	const { side, file, diffs: pD } = m.data as BaseDiffPayload;
	const nF = [...p.filesRef.current] as PaneFiles;
	nF[side === "left" ? 0 : 4] = file;
	p.filesRef.current = nF;
	p.setFiles(nF);

	const nD = [...p.diffsRef.current] as PaneDiffs;
	nD[side === "left" ? 0 : 3] = pD;
	p.diffsRef.current = nD;
	p.setDiffs(nD);
	setTimeout(() => {
		p.setRenderTrigger((prev) => {
			return prev + 1;
		});
	}, HACK_SYNC_DELAY);
}

function handleUpdateConfig(m: any, p: MessageHandlersDeps) {
	const c = m.config;
	if (!c) {
		return;
	}
	if (c.debounceDelay !== undefined) {
		p.setDebounceDelay(c.debounceDelay);
	}
	if (c.syntaxHighlighting !== undefined) {
		p.setSyntaxHighlighting(c.syntaxHighlighting);
	}
	if (c.baseCompareHighlighting !== undefined) {
		p.setBaseCompareHighlighting(c.baseCompareHighlighting);
	}
	if (c.smoothScrolling !== undefined) {
		p.setSmoothScrolling(c.smoothScrolling);
	}
}

export const useAppMessageHandlers = (p: MessageHandlersDeps) => {
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const m = event.data;
			switch (m.command) {
				case "loadDiff":
					handleLoadDiff(m, p);
					break;
				case "loadBaseDiff":
					handleLoadBaseDiff(m, p);
					break;
				case "updateContent":
					p.setExternalSyncId((id) => {
						return id + 1;
					});
					p.commitModelUpdate(m.text);
					break;
				case "updateConfig":
					handleUpdateConfig(m, p);
					break;
				case "clipboardText":
					p.resolveClipboardRead(Number(m.requestId), m.text as string);
					break;
			}
		};
		window.addEventListener("message", handleMessage);
		if (p.vscodeApi) {
			p.vscodeApi.postMessage({ command: "ready" });
		}
		return () => {
			window.removeEventListener("message", handleMessage);
		};
	}, [p]);
};

function getPaneHighlights(paneIndex: number, files: PaneFiles, diffs: PaneDiffs, isLBC: boolean, isRBC: boolean): Highlight[] {
	const h: Highlight[] = [];
	if (paneIndex === 0) {
		const d = diffs[0];
		if (d) {
			for (const c of d) {
				processChunk(h, c, true, files[0], files[1]);
			}
		}
	} else if (paneIndex === 1) {
		const d = isLBC ? diffs[0] : diffs[1];
		if (d) {
			for (const c of d) {
				processChunk(h, c, false, files[1], isLBC ? files[0] : files[2]);
			}
		}
	} else if (paneIndex === 2) {
		const d1 = diffs[1];
		const d2 = diffs[2];
		if (d1) {
			for (const c of d1) {
				processChunk(h, c, true, files[2], files[1]);
			}
		}
		if (d2) {
			for (const c of d2) {
				processChunk(h, c, true, files[2], files[3]);
			}
		}
	} else if (paneIndex === 3) {
		const d = isRBC ? diffs[3] : diffs[2];
		if (d) {
			for (const c of d) {
				processChunk(h, c, isRBC, files[3], isRBC ? files[4] : files[2]);
			}
		}
	} else if (paneIndex === 4) {
		const d = diffs[3];
		if (d) {
			for (const c of d) {
				processChunk(h, c, false, files[4], files[3]);
			}
		}
	}
	return h;
}

export const useAppHighlights = (files: PaneFiles, diffs: PaneDiffs, bCH: boolean) =>
	useCallback(
		(idx: number) => {
			if (files.length < 5) {
				return [];
			}
			const isLBC = bCH && Boolean(files[0]);
			const isRBC = bCH && Boolean(files[4]);
			return getPaneHighlights(idx, files, diffs, isLBC, isRBC);
		},
		[diffs, files, bCH],
	);

function findTargetChunk(sorted: DiffChunk[], cur: number, dir: "prev" | "next"): DiffChunk | null {
	const n = sorted.length;
	if (n === 0) {
		return null;
	}
	const idx = sorted.findIndex((c) => {
		return c.startA + 1 >= cur;
	});
	if (dir === "next") {
		if (idx === -1) {
			return sorted[0] as DiffChunk;
		}
		const c = sorted[idx] as DiffChunk;
		return c.startA + 1 <= cur ? (sorted[(idx + 1) % n] as DiffChunk) : c;
	}
	if (idx === -1) {
		return sorted[n - 1] as DiffChunk;
	}
	const c = sorted[idx] as DiffChunk;
	return c.startA + 1 < cur ? c : (sorted[(idx - 1 + n) % n] as DiffChunk);
}

export const useAppNavigation = (editorRefs: React.RefObject<editor.IStandaloneCodeEditor[]>, diffsRef: React.MutableRefObject<PaneDiffs>) =>
	useCallback(
		(dir: "prev" | "next", type: "diff" | "conflict") => {
			const ed = editorRefs.current?.[2];
			if (!ed) {
				return;
			}
			const all = [...(diffsRef.current[1] ?? []), ...(diffsRef.current[2] ?? [])];
			const sorted = all
				.filter((c) => {
					return c.tag !== "equal" && (type !== "conflict" || c.tag === "conflict");
				})
				.sort((a, b) => {
					return a.startA - b.startA;
				})
				.filter((c, i, self) => {
					return i === 0 || c.startA !== (self[i - 1] as DiffChunk).startA;
				});

			const target = findTargetChunk(sorted, ed.getPosition()?.lineNumber || 1, dir);
			if (target) {
				ed.revealLineInCenter(target.startA + 1);
				ed.setPosition({ lineNumber: target.startA + 1, column: 1 });
				ed.focus();
			}
		},
		[editorRefs, diffsRef],
	);

export const useAppChunkActions = (editorRefs: React.RefObject<editor.IStandaloneCodeEditor[]>) => {
	const handleApplyChunk = useCallback(
		(paneIndex: number, chunk: DiffChunk) => {
			const srcEd = editorRefs.current?.[paneIndex];
			const mEd = editorRefs.current?.[2];
			if (srcEd && mEd) {
				const srcM = srcEd.getModel();
				const mM = mEd.getModel();
				if (srcM && mM) {
					const txt = getChunkText(srcM, chunk, mM.getLineCount());
					applyChunkEdit(mEd, chunk, txt);
				}
			}
		},
		[editorRefs],
	);

	const handleDeleteChunk = useCallback(
		(_pIdx: number, chunk: DiffChunk) => {
			const mEd = editorRefs.current?.[2];
			if (mEd) {
				deleteChunk(mEd, chunk);
			}
		},
		[editorRefs],
	);

	const handleCopyUpChunk = useCallback(
		(paneIndex: number, chunk: DiffChunk) => {
			const srcEd = editorRefs.current?.[paneIndex];
			const mEd = editorRefs.current?.[2];
			if (srcEd && mEd) {
				const srcM = srcEd.getModel();
				const mM = mEd.getModel();
				if (srcM && mM) {
					const txt = getChunkText(srcM, chunk, mM.getLineCount());
					copyUpChunk(mEd, chunk, txt);
				}
			}
		},
		[editorRefs],
	);

	const handleCopyDownChunk = useCallback(
		(paneIndex: number, chunk: DiffChunk) => {
			const srcEd = editorRefs.current?.[paneIndex];
			const mEd = editorRefs.current?.[2];
			if (srcEd && mEd) {
				const srcM = srcEd.getModel();
				const mM = mEd.getModel();
				if (srcM && mM) {
					const txt = getChunkText(srcM, chunk, mM.getLineCount());
					copyDownChunk(mEd, chunk, txt);
				}
			}
		},
		[editorRefs],
	);

	return { handleApplyChunk, handleDeleteChunk, handleCopyUpChunk, handleCopyDownChunk };
};
