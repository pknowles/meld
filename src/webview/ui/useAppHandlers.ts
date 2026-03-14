import debounce from "lodash.debounce";
import { useMemo } from "react";
import type { PaneDiffs, PaneFiles } from "./appHooks.ts";
import type { useVscodeMessageBus } from "./useVSCodeMessageBus.ts";

interface HandlersDeps {
	ui: {
		files: PaneFiles;
		diffs: PaneDiffs;
		filesRef: React.MutableRefObject<PaneFiles>;
		diffsRef: React.MutableRefObject<PaneDiffs>;
		setFiles: (f: PaneFiles) => void;
		setDiffs: (d: PaneDiffs) => void;
		debounceDelay: number;
	};
	vscodeApi: ReturnType<typeof useVscodeMessageBus>;
	commitModelUpdate: (v: string) => void;
}

export function useAppHandlers(deps: HandlersDeps) {
	const { ui, vscodeApi, commitModelUpdate } = deps;

	const handlers = useMemo(
		() => ({
			onCopyHash: (hash: string) =>
				vscodeApi?.postMessage({ command: "copyHash", hash }),
			onShowDiff: (idx: number) =>
				vscodeApi?.postMessage({ command: "showDiff", paneIndex: idx }),
			onCompleteMerge: () =>
				vscodeApi?.postMessage({ command: "completeMerge" }),
			toggleBase: (side: "left" | "right") => {
				const targetIdx = side === "left" ? 0 : 4;
				const targetFile = ui.files[targetIdx];
				if (targetFile) {
					const nf = [...ui.files] as PaneFiles;
					nf[targetIdx] = null;
					ui.filesRef.current = nf;
					ui.setFiles(nf);
					const nd = [...ui.diffs] as PaneDiffs;
					nd[side === "left" ? 0 : 3] = null;
					ui.diffsRef.current = nd;
					ui.setDiffs(nd);
				} else {
					vscodeApi?.postMessage({
						command: "requestBaseDiff",
						side,
					});
				}
			},
		}),
		[
			ui.files,
			ui.diffs,
			ui.setFiles,
			ui.setDiffs,
			ui.filesRef,
			ui.diffsRef,
			vscodeApi,
		],
	);

	const onEdit = useMemo(
		() =>
			debounce((v: string | undefined, i: number) => {
				if (v !== undefined && i === 2) {
					commitModelUpdate(v);
					vscodeApi?.postMessage({
						command: "contentChanged",
						text: v,
					});
				}
			}, ui.debounceDelay),
		[ui.debounceDelay, commitModelUpdate, vscodeApi],
	);

	return { handlers, onEdit };
}
