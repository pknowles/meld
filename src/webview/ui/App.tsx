import type { FC } from "react";
import {
	useAppChunkActions,
	useAppHighlights,
	useAppMessageHandlers,
	useAppNavigation,
	useCommitModelUpdate,
	usePreviousNonNull,
} from "./appHooks.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { MeldRoot } from "./MeldRoot.tsx";
import { PanesList } from "./PanesList.tsx";
import { useAppHandlers } from "./useAppHandlers.ts";
import { useAppLogic } from "./useAppLogic.ts";
import { useBaseRenderState } from "./useBaseRenderState.ts";
import { useClipboardOverrides } from "./useClipboardOverrides.ts";
import { useSynchronizedScrolling } from "./useSynchronizedScrolling.ts";
import { useVscodeMessageBus } from "./useVSCodeMessageBus.ts";

export const App: FC = () => {
	const ui = useAppLogic();
	const [renderBL, renderBR] = useBaseRenderState(ui.files);
	const vscodeApi = useVscodeMessageBus();
	const { resolveClipboardRead, requestClipboardText, writeClipboardText } =
		useClipboardOverrides(ui.editorRefArray);
	const { attachScrollListener, forceSyncToPane } = useSynchronizedScrolling(
		ui.editorRefArray,
		ui.diffsRef,
		ui.diffsAreReversedRef,
		ui.setRenderTrigger,
		ui.smoothScrolling,
	);

	const prevB = [
		usePreviousNonNull(ui.files[0]),
		usePreviousNonNull(ui.files[4]),
	] as const;
	const prevD = [
		usePreviousNonNull(ui.diffs[0]),
		usePreviousNonNull(ui.diffs[3]),
	] as const;

	const commitModelUpdate = useCommitModelUpdate({
		filesRef: ui.filesRef,
		diffsRef: ui.diffsRef,
		setFiles: ui.setFiles,
		setDiffs: ui.setDiffs,
		setRenderTrigger: ui.setRenderTrigger,
		differRef: ui.differRef,
	});

	useAppMessageHandlers({
		filesRef: ui.filesRef,
		diffsRef: ui.diffsRef,
		setFiles: ui.setFiles,
		setDiffs: ui.setDiffs,
		setExternalSyncId: ui.setExternalSyncId,
		setDebounceDelay: ui.setDebounceDelay,
		setSyntaxHighlighting: ui.setSyntaxHighlighting,
		setBaseCompareHighlighting: ui.setBaseCompareHighlighting,
		setSmoothScrolling: ui.setSmoothScrolling,
		setRenderTrigger: ui.setRenderTrigger,
		commitModelUpdate,
		resolveClipboardRead,
		vscodeApi,
		differRef: ui.differRef,
	});

	const highlights = useAppHighlights(
		ui.files,
		ui.diffs,
		ui.baseCompareHighlighting,
	);
	const handleNavigate = useAppNavigation(ui.editorRefArray, ui.diffsRef);
	const chunkActions = useAppChunkActions(ui.editorRefArray);
	const { handlers, onEdit } = useAppHandlers({
		ui,
		vscodeApi,
		commitModelUpdate,
	});

	if (ui.files[1] === null) {
		return (
			<div
				style={{
					color: "white",
					padding: "20px",
					fontFamily: "sans-serif",
				}}
			>
				Loading Diff...
			</div>
		);
	}

	return (
		<ErrorBoundary>
			<MeldRoot>
				<PanesList
					ui={ui}
					prevB={prevB}
					prevD={prevD}
					renderBL={renderBL}
					renderBR={renderBR}
					highlights={highlights}
					handleNavigate={handleNavigate}
					{...chunkActions}
					handlers={handlers}
					attachScrollListener={attachScrollListener}
					forceSyncToPane={forceSyncToPane}
					requestClipboardText={requestClipboardText}
					writeClipboardText={writeClipboardText}
					onEdit={onEdit}
				/>
			</MeldRoot>
		</ErrorBoundary>
	);
};
