# Comprehensive UI Regression Fix Summary

This document provides a detailed technical overview of the fixes implemented to resolve regressions in the Meld project following the large-scale refactors in early 2026. These fixes ensure visual stability, functional scroll synchronization, correct component interaction, and layout integrity.

## 1. Core State & Logic Stability

### 1.1 Messaging Loop Prevention (Critical Path)
*   **Files Involved**: `src/webview/ui/App.tsx`, `src/webview/ui/appHooks.ts`
*   **Original Code**: Logic lived in `App.tsx` where effects were directly attached to the `files` state.
*   **Refactored State**: Logic moved to `useAppMessageHandlers` in `appHooks.ts`.
*   **The Breakage**: The `useAppMessageHandlers` hook received new dependency objects on every render because `App.tsx` passed unmemoized props. This caused the Webview to send a `"ready"` message on every render. The extension responded with fresh data, resetting the Base panels and causing them to "snap shut" immediately after opening.
*   **Root Cause**: Lack of dependency stabilization in custom hooks causing circular state updates with the extension host.
*   **Fix**:
    *   Memoized the dependencies passed to `useAppMessageHandlers` in `App.tsx` using `useMemo`.
    *   Stabilized `useAppCoreData` and `useAppServices` results to ensure stable references for all downstream hooks.

### 1.2 "Compare to Base" State Recovery
*   **Files Involved**: `src/webview/ui/CodePane.tsx`, `src/webview/ui/App.tsx`, `src/webview/ui/meldPaneTypes.ts`
*   **Original Code**: Props were passed individually through `CodePane` to children like `ToggleBaseBtn`.
*   **Refactored State**: Props were grouped into `ui` and `actions` objects.
*   **The Breakage**: Critical props (`onToggleBase`, `baseSide`, `isBaseActive`) were dropped or incorrectly mapped during the component restructure. Clicking "Compare with Base" failed to update the visual state (the button wouldn't turn blue) and panels wouldn't stay open.
*   **Root Cause**: Incomplete prop-drilling migration during component refactoring.
*   **Fix**:
    *   Restored correctly named props to the `CodePane` component.
    *   Fixed `useMeldUIActions` in `App.tsx` to correctly handle the `toggleBaseDiff` action.

## 2. Scroll Synchronization Refactor

### 2.1 Editor Attachment Logic
*   **Files Involved**: `src/webview/ui/App.tsx`, `src/webview/ui/useSynchronizedScrolling.ts`
*   **Original Code**: `onMount` in `CodePane.tsx` directly called `attachScrollListener`.
*   **The Breakage**: The `attachScrollListener` call was omitted in the new centralized `handleMountEditor` in `App.tsx`. As a result, scrolling one pane did not affect others.
*   **Root Cause**: Functional regression due to omitted invocation in a centralized lifecycle callback.
*   **Fix**: Updated `handleMountEditor` to automatically attach the listener as soon as an editor mounts.

### 2.2 Listener Stability (Ref-based Options)
*   **Files Involved**: `src/webview/ui/useSynchronizedScrolling.ts`
*   **The Breakage**: Toggling settings like "Smooth Scrolling" changed the identity of `syncEditors`. However, event listeners attached to Monaco held onto *stale* function references, causing scroll synchronization to die as soon as a setting was changed.
*   **Root Cause**: Stale closures in non-React event listeners (Monaco API).
*   **Fix**: Stored configuration options in React `refs` inside `useSynchronizedScrolling.ts`. This allows the listeners to access the latest settings without needing to be detached and re-attached.

## 3. Visual & Style Restorations

### 3.1 Diff Highlighting (Monaco Decorators)
*   **Files Involved**: `src/webview/ui/App.tsx`, `src/webview/ui/highlightUtil.ts`
*   **The Breakage**: Background highlights for inserts, deletes, and replaces disappeared.
*   **Root Cause**: Global `.diff-*` CSS classes were removed during the move to component-scoped styles. Since Monaco injects these classes into its own DOM nodes, scoped CSS couldn't "see" them.
*   **Fix**: Re-instated all `.diff-` selectors (insert, delete, replace, conflict, inline, margin) into the `GlobalStyles` component in `App.tsx`.

### 3.2 Diff Curtains & Action Buttons
*   **Files Involved**: `src/webview/ui/DiffCurtain.tsx`
*   **Vertical Jitter**: Fixed the "double vision" by removing redundant offsets in `getY`. The SVG `transform` now precisely calculates the delta between "live" and "debounced" scroll positions.
*   **Unique Masks**: Implemented `useId()` for SVG masks. This prevents multiple curtains from sharing the same mask IDs, which previously caused one curtain's gradients to interfere with another's visibility.
*   **Action Buttons**: Fixed the `.action-button` CSS and corrected `x` coordinates for the new fixed 30px curtain width.

## 4. Layout & Maintenance

### 4.1 Layout Integrity
*   **Files Involved**: `src/webview/ui/App.tsx`
*   **The Breakage**: The UI would occasionally collapse vertically or not fill the screen.
*   **Fix**: Restored `100vh` and `100vw` constraints to the `MeldRoot` in `App.tsx` and ensured all parent containers (`html`, `body`, `#root`) have `height: 100%`.

### 4.2 Code Cleanup
*   **Action**: Deleted `src/webview/ui/meldPane.tsx` and removed the `MeldPaneProps` interface.
*   **Reasoning**: These were identified as unused by `knip`. Their presence made the component tree confusing and invited state synchronization bugs.

## 5. Verification Status

*   **Build**: `npm run build` succeeds (TSC, Biome, Knip, Esbuild).
*   **Tests**: `npx jest src/webview/ui/refactor_regression.test.tsx` PASSES.
    *   Confirms no `validateDOMNesting` errors.
    *   Confirms correct mounting of `DiffCurtain` components.
    *   Confirms "Compare with Base" triggers correct UI transitions.
