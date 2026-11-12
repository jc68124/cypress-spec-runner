import { useId, useRef, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import * as Headless from '@headlessui/react';

export function Button({ children, kind = 'outline', small = false, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'outline' | 'primary' | 'plain' | 'danger'; small?: boolean }) {
    return <button type="button" {...props} className={`btn btn-${kind} ${small ? 'btn-small' : ''} ${className}`}>{children}</button>;
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
