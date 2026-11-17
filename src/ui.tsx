import { useId, useRef, useEffect, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import * as Headless from '@headlessui/react';

export type ActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
    successLabel?: string;
};
export function useButtonAction(onClick: ActionButtonProps['onClick'], successLabel?: string) {
    const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(''), [error, setError] = useState('');
    const running = useRef(false), mounted = useRef(true), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearTimeout(timer.current); }; }, []);
    function click(event: MouseEvent<HTMLButtonElement>) {
        if (running.current) return;
        clearTimeout(timer.current); setFeedback(''); setError('');
        function finish(succeeded: boolean, failure?: unknown) {
            running.current = false;
            if (!mounted.current) return;
            setBusy(false);
            if (!succeeded) setError(failure instanceof Error ? failure.message : failure ? String(failure) : 'Action failed. Please try again.');
            else if (successLabel) { setFeedback(successLabel); timer.current = setTimeout(() => setFeedback(''), 2000); }
        }
        try {
            const result = onClick?.(event);
            if (result && typeof result.then === 'function') {
                running.current = true; setBusy(true);
                void result.then(() => finish(true), error => finish(false, error));
            } else finish(true);
        } catch (error) { finish(false, error); }
    }
    return { busy, feedback, error, click };
}
export function Spinner() { return <span aria-hidden="true" className="button-spinner" />; }
export function Button({ children, kind = 'outline', small = false, className = '', onClick, successLabel, disabled, ...props }: ActionButtonProps & { kind?: 'outline' | 'primary' | 'plain' | 'danger'; small?: boolean }) {
    const action = useButtonAction(onClick, successLabel);
    return <button type="button" {...props} disabled={disabled || action.busy} aria-busy={action.busy || undefined} title={action.error || props.title} onClick={action.click} className={`btn btn-${kind} ${small ? 'btn-small' : ''} ${className}`}>
        {action.busy && <Spinner />}{action.error ? <span role="alert" className="max-w-64 truncate">Failed: {action.error}</span> : action.feedback ? <span role="status">{action.feedback}</span> : children}
    </button>;
}
export function Help({ label, children }: { label: string; children: ReactNode }) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ left: 0, top: 0 });
    const button = useRef<HTMLButtonElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    function show() {
        clearTimeout(timer.current);
        const rect = button.current?.getBoundingClientRect();
        if (rect) setPosition({ left: Math.max(12, Math.min(rect.left, innerWidth - 276)), top: Math.min(rect.bottom + 8, innerHeight - 130) });
        setOpen(true);
    }
    function hide() { timer.current = setTimeout(() => { if (document.activeElement !== button.current) setOpen(false); }, 150); }
    useEffect(() => () => clearTimeout(timer.current), []);
    return <span className="help" onMouseEnter={show} onMouseLeave={hide}>
        <button ref={button} type="button" aria-label={label} aria-describedby={open ? id : undefined} className="help-button" onFocus={show} onBlur={() => setOpen(false)} onClick={show} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>?</button>
        {open && <span role="tooltip" id={id} className="help-text" style={position} onMouseEnter={show} onMouseLeave={hide}>{children}</span>}
    </span>;
}
export function Checkbox({ checked, partial = false, onChange, label, disabled = false }: { checked: boolean; partial?: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { if (ref.current) ref.current.indeterminate = partial; }, [partial]);
    return <input ref={ref} type="checkbox" aria-label={label} aria-checked={partial ? 'mixed' : checked} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />;
}
export function Modal({ title, description, onClose, children, actions }: { title: string; description?: string; onClose: () => void; children: ReactNode; actions: ReactNode }) {
    return <Headless.Dialog open onClose={onClose} className="dialog-root">
        <Headless.DialogBackdrop className="dialog-backdrop" />
        <div className="dialog-position"><Headless.DialogPanel className="dialog-panel">
            <Headless.DialogTitle className="text-lg font-semibold text-white">{title}</Headless.DialogTitle>
            {description && <Headless.Description className="mt-2 text-sm leading-6 text-zinc-400">{description}</Headless.Description>}
            <div className="my-5">{children}</div><div className="flex flex-wrap justify-end gap-2">{actions}</div>
        </Headless.DialogPanel></div>
    </Headless.Dialog>;
}
