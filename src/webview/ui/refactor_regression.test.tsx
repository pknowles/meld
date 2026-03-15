import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { act } from "react-dom/test-utils";
import { App } from "./App.tsx";
import { CodePane } from "./CodePane.tsx";

jest.setTimeout(30_000);

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
	observe() {
		/* mock */
	}
	unobserve() {
		/* mock */
	}
	disconnect() {
		/* mock */
	}
};

// Mock monaco-editor
jest.mock("monaco-editor", () => ({
	editor: {
		// biome-ignore lint/style/useNamingConvention: mock
		EditorOption: {
			readOnly: "readOnly",
			lineHeight: "lineHeight",
		},
	},
	// biome-ignore lint/style: mock
	KeyCode: {},
	// biome-ignore lint/style: mock
	KeyMod: {
		// biome-ignore lint/style: mock
		CtrlCmd: 0,
	},
	// biome-ignore lint/style: mock
	Selection: class {},
}));

// Mock Monaco Editor
jest.mock("@monaco-editor/react", () => {
	return {
		__esModule: true,
		// biome-ignore lint/suspicious/noExplicitAny: mock
		default: ({ onMount }: any) => {
			React.useEffect(() => {
				if (onMount) {
					// Simulate async mounting
					setTimeout(() => {
						onMount(
							{
								getScrollTop: () => 0,
								getScrollLeft: () => 0,
								getContentHeight: () => 1000,
								getContainerDomNode: () => ({
									getBoundingClientRect: () => ({
										top: 0,
										left: 0,
										width: 100,
										height: 1000,
									}),
								}),
								onDidScrollChange: () => ({
									dispose: () => {
										/* mock */
									},
								}),
								addAction: () => {
									/* mock */
								},
								getDomNode: () => document.createElement("div"),
								getLayoutInfo: () => ({ height: 1000 }),
								getPosition: () => ({
									lineNumber: 1,
									column: 1,
								}),
								deltaDecorations: () => [],
								getValue: () => "",
								revealLineInCenter: () => {
									/* mock */
								},
								setPosition: () => {
									/* mock */
								},
								focus: () => {
									/* mock */
								},
								getOption: () => 14,
								getTopForLineNumber: (line: number) =>
									line * 14,
								getModel: () => ({
									getLineCount: () => 10,
									getValueInRange: () => "",
									getLineContent: () => "",
									pushEditOperations: () => {
										/* mock */
									},
								}),
							},
							{},
						);
					}, 0);
				}
			}, [onMount]);
			return <div data-testid="mock-monaco" />;
		},
	};
});

// biome-ignore lint/complexity: large regression suite
describe("Refactoring Regressions", () => {
	// We will capture validateDOMNesting specifically. Default testing-library doesn't inherently throw, but we can spy on console.error.
	let consoleErrorMock: jest.SpyInstance;
	beforeEach(() => {
		consoleErrorMock = jest
			.spyOn(console, "error")
			.mockImplementation((msg) => {
				if (
					typeof msg === "string" &&
					msg.includes("validateDOMNesting")
				) {
					throw new Error(msg);
				}
			});
	});
	afterEach(() => {
		consoleErrorMock.mockRestore();
	});

	it("should not have button nested inside button (validateDOMNesting)", () => {
		const mockFile = {
			label: "Local",
			commit: {
				title: "Title",
				hash: "1234",
				authorName: "Jane",
				authorEmail: "j@j.com",
				date: "2026",
				body: "body",
			},
		};
		render(
			<CodePane
				// biome-ignore lint/suspicious/noExplicitAny: mock
				file={mockFile as any}
				index={1}
				// biome-ignore lint/suspicious/noExplicitAny: mock
				ui={{ files: [], externalSyncId: 1 } as any}
				actions={
					{
						handleCopyHash: () => {
							/* mock */
						},
						handleShowDiff: () => {
							/* mock */
						},
						// biome-ignore lint/suspicious/noExplicitAny: mock
					} as any
				}
				isMiddle={false}
				onMount={() => {
					/* mock */
				}}
			/>,
		);

		const outerCommitBtn = screen.getByText("[Title]");
		fireEvent.mouseEnter(outerCommitBtn);

		// This will throw if the above validation fails
		// If it doesn't throw by ReactDOM itself, let's explicitly ensure the top element of the commit info is NOT a button if it contains another button
		const copyBtns = screen.queryAllByTitle("Copy Hash");
		expect(copyBtns.length).toBeGreaterThan(0);
		expect(outerCommitBtn.tagName).not.toBe("BUTTON");
	});

	it("should render diff curtains when editors mount (testing pane connection)", async () => {
		const { findByText } = render(<App />);

		// Wait for loading screen
		await findByText("Loading Diff...");

		const loadDiff = {
			command: "loadDiff",
			data: {
				files: [
					{
						label: "File 1",
						content: "A\nB",
						commit: { title: "C1", hash: "1" },
					},
					{
						label: "File 2",
						content: "A\nB\nC",
						commit: { title: "C2", hash: "2" },
					},
					{
						label: "File 3",
						content: "A\nC",
						commit: { title: "C3", hash: "3" },
					},
				],
				diffs: [
					[{ tag: "insert", startA: 1, endA: 1, startB: 1, endB: 2 }],
					[],
				],
			},
		};

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", { data: loadDiff }),
			);
		});

		// The diff curtain should be visible. In the broken version, they don't mount because the parent doesn't re-render.
		// Wait cleaner for the elements
		const curtains = await screen.findAllByTitle(
			"Diff connectors",
			{},
			{ timeout: 10_000 },
		);
		expect(curtains.length).toBeGreaterThan(0);
	});

	it("should have MeldRoot take full space", async () => {
		render(<App />);
		const loadDiff = {
			command: "loadDiff",
			data: {
				files: [
					{
						label: "F1",
						content: "1",
						commit: { title: "C1", hash: "1" },
					},
					{
						label: "F2",
						content: "2",
						commit: { title: "C2", hash: "2" },
					},
					{
						label: "F3",
						content: "3",
						commit: { title: "C3", hash: "3" },
					},
				],
				diffs: [[], []],
			},
		};
		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", { data: loadDiff }),
			);
		});

		// Now we expect this to fail OR we check the style
		const root = await screen.findByTestId("meld-root");
		expect(root.style.height).toBe("100vh");
	});

	it("should show base pane when requested (Point 4)", async () => {
		render(<App />);
		const loadDiff = {
			command: "loadDiff",
			data: {
				files: [
					{
						label: "F1",
						content: "1",
						commit: { title: "C1", hash: "1" },
					},
					{
						label: "F2",
						content: "2",
						commit: { title: "C2", hash: "2" },
					},
					{
						label: "F3",
						content: "3",
						commit: { title: "C3", hash: "3" },
					},
				],
				diffs: [[], []],
			},
		};
		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", { data: loadDiff }),
			);
		});

		const compareBtns = await screen.findAllByTitle("Compare with Base");
		const btn = compareBtns[0];
		if (!btn) {
			throw new Error("Compare button not found");
		}
		fireEvent.click(btn);

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						command: "loadBaseDiff",
						data: {
							side: "left",
							file: {
								label: "Base",
								content: "0",
								commit: { title: "B1", hash: "0" },
							},
							diffs: [
								{
									tag: "insert",
									startA: 0,
									endA: 0,
									startB: 0,
									endB: 1,
								},
							],
						},
					},
				}),
			);
		});

		// The base pane should now render. Wait for it specifically.
		const basePanes = await screen.findAllByText(
			"Base",
			{},
			{ timeout: 10_000 },
		);
		expect(basePanes.length).toBeGreaterThan(0);
		expect(basePanes[0]).toBeInTheDocument();

		// It should be visible (not collapsed)
		// We wait a bit for the animation frame to set setActive(true)
		await new Promise((r) => setTimeout(r, 100));
		const col = document.getElementById("col-base-left");
		expect(col?.style.marginLeft).toBe("0px");
	});
});
