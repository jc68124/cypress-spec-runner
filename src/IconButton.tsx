import type { ButtonHTMLAttributes } from 'react';
const paths = {
    edit: 'm15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z',
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    copy: 'M8 8h12v13H8ZM16 8V3H3v13h5',
    file: 'M14 2H5v20h14V7ZM14 2v6h5M8 13h8M8 17h6',
    folder: 'M2 20V5h7l3 3h10l-3 12ZM2 10h20',
    info: 'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    grid: 'M3 3h18v18H3ZM3 9h18M3 15h18M9 3v18M15 3v18',
    close: 'm6 6 12 12M6 18 18 6',
    rerun: 'M3 11a9 9 0 1 1 2 7M3 3v8h8',
    menu: 'M4 6h16M4 12h16M4 18h16',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
};
export function IconButton({ icon, label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: keyof typeof paths; label: string }) {
    return <button type="button" aria-label={label} title={label} {...props} className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-40 ${className}`}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[icon]} /></svg></button>;
}
