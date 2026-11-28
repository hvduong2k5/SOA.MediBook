import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main style={{ padding: 'var(--space-8)', maxWidth: 640, margin: '0 auto' }}>
          <h1>Đã xảy ra lỗi giao diện</h1>
          <p>Vui lòng tải lại trang hoặc thử lại sau.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-control)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-primary)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Tải lại trang
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
