import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; label?: string };
type State = { error: Error | null };

// Keeps a render crash in one view from white-screening the whole app.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // Reset when the wrapped content changes (e.g. switching views/projects).
    if (prev.children !== this.props.children && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <h2 className="text-sm font-semibold text-red-400">
            {this.props.label ?? "Something went wrong"}
          </h2>
          <pre className="max-w-lg overflow-auto text-xs text-zinc-500">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-1 rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
