import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw, Trash2, ShoppingCart, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🔥 [ErrorBoundary Caught Error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearStorageAndReload = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.href = '/';
  };

  private handleGoToPos = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  private handleCopyError = () => {
    const errorDetails = `Error: ${this.state.error?.message}\n\nStack:\n${this.state.error?.stack}\n\nComponentStack:\n${this.state.errorInfo?.componentStack}`;
    navigator.clipboard.writeText(errorDetails).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          dir="rtl"
          className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 font-tajawal antialiased select-none"
          style={{ backgroundColor: '#090d16' }}
        >
          <div className="max-w-xl w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
            {/* Header Icon & Title */}
            <div className="flex items-center gap-4 border-b border-slate-800/80 pb-5">
              <div className="w-14 h-14 rounded-2xl bg-rose-950/70 border border-rose-500/40 text-rose-400 flex items-center justify-center shadow-lg shrink-0">
                <AlertOctagon className="w-7 h-7" />
              </div>
              <div className="space-y-1 flex-1">
                <h2 className="text-lg sm:text-xl font-black text-white">
                  عذراً، حدث خطأ أثناء تشغيل النظام
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  تم التقاط استثناء برمجي غير متوقع ومنع الشاشة من التوقف
                </p>
              </div>
            </div>

            {/* Error Message Box */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 text-xs font-mono text-rose-300 break-words leading-relaxed space-y-1">
              <div className="font-bold text-rose-400 flex items-center justify-between">
                <span>رسالة الخطأ (Exception Details):</span>
                <button
                  type="button"
                  onClick={this.handleCopyError}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white transition-colors"
                  title="نسخ تفاصيل الخطأ"
                >
                  {this.state.copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>نسخ</span>
                    </>
                  )}
                </button>
              </div>
              <div className="mt-1 text-slate-200">
                {this.state.error?.message || 'Unknown runtime render exception'}
              </div>
            </div>

            {/* Technical Stack Trace Accordion */}
            <div>
              <button
                type="button"
                onClick={() => this.setState({ showDetails: !this.state.showDetails })}
                className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-200 py-1.5 transition-colors"
              >
                <span>عرض التفاصيل التقنية الدقيقة (Stack Trace)</span>
                {this.state.showDetails ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {this.state.showDetails && (
                <div className="mt-2 p-3 rounded-xl bg-black/60 border border-slate-800 text-[11px] font-mono text-slate-400 overflow-x-auto max-h-48 overflow-y-auto ltr text-left leading-relaxed">
                  <div className="text-rose-400 font-bold mb-1">{this.state.error?.stack}</div>
                  {this.state.errorInfo && (
                    <div className="text-slate-500 mt-2">{this.state.errorInfo.componentStack}</div>
                  )}
                </div>
              )}
            </div>

            {/* Action Recovery Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg transition-all active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة تحميل</span>
              </button>

              <button
                type="button"
                onClick={this.handleClearStorageAndReload}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-amber-500/30 transition-all active:scale-95"
                title="مسح الكاش والذاكرة المحلية والبدء من جديد"
              >
                <Trash2 className="w-4 h-4" />
                <span>إعادة ضبط الذاكرة</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoToPos}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-all active:scale-95"
              >
                <ShoppingCart className="w-4 h-4 text-cyan-400" />
                <span>شاشة الكاشير</span>
              </button>
            </div>

            <div className="text-center pt-2 text-[11px] text-slate-500">
              PRIME WASH POS &bull; نظام إدارة مغاسل السيارات الذكي &copy; 2026
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
