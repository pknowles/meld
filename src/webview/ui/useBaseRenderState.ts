import { useLayoutEffect, useState } from "react";
import type { PaneFiles } from "./appHooks.ts";
import { ANIMATION_DURATION } from "./types.ts";

export function useBaseRenderState(files: PaneFiles) {
	const [renderLeft, setRenderLeft] = useState(false);
	const [renderRight, setRenderRight] = useState(false);

	useLayoutEffect(() => {
		if (files[0]) {
			setRenderLeft(true);
			return;
		}
		const t = setTimeout(() => setRenderLeft(false), ANIMATION_DURATION);
		return () => clearTimeout(t);
	}, [files[0]]);

	useLayoutEffect(() => {
		if (files[4]) {
			setRenderRight(true);
			return;
		}
		const t = setTimeout(() => setRenderRight(false), ANIMATION_DURATION);
		return () => clearTimeout(t);
	}, [files[4]]);

	return [renderLeft, renderRight] as const;
}
