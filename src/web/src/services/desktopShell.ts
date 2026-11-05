// Only exists inside the desktop window, not in pnpm dev.
declare global {
  interface Window {
    chrome?: { webview?: { postMessage: (message: string) => void } }
  }
}

/** Tells the window whether closing it would lose something. These two texts must match MainWindow.xaml.cs. */
export function tellWindowAboutUnsavedChanges(hasChanges: boolean) {
  window.chrome?.webview?.postMessage(hasChanges ? 'unsaved-changes' : 'no-unsaved-changes')
}
