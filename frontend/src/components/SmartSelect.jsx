import { useEffect, useMemo, useRef, useState } from 'react';

export default function SmartSelect({
    value,
    onChange,
    options = [],
    placeholder = 'בחר...',
    searchPlaceholder = 'חפש...',
    emptyText = 'אין תוצאות',
    disabled = false
}) {
    const rootRef = useRef(null);
    const listRef = useRef(null);

    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [highlightIndex, setHighlightIndex] = useState(0);

    const normalizedOptions = useMemo(() => {
        return options
            .map((item) => String(item ?? '').trim())
            .filter(Boolean);
    }, [options]);

    const filteredOptions = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return normalizedOptions;

        return normalizedOptions.filter((item) =>
            item.toLowerCase().includes(term)
        );
    }, [normalizedOptions, search]);

    useEffect(() => {
        function handleOutsideClick(event) {
            if (!rootRef.current?.contains(event.target)) {
                setOpen(false);
            }
        }

        function handleEscape(event) {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        }

        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    useEffect(() => {
        setHighlightIndex(0);
    }, [search, open]);

    useEffect(() => {
        if (!open || !listRef.current) return;

        const activeItem = listRef.current.querySelector('.smart-select-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'nearest' });
        }
    }, [highlightIndex, open]);

    function selectItem(item) {
        onChange(item);
        setSearch('');
        setOpen(false);
    }

    function handleKeyDown(event) {
        if (disabled) return;

        if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            setOpen(true);
            return;
        }

        if (!open) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlightIndex((prev) =>
                Math.min(prev + 1, Math.max(filteredOptions.length - 1, 0))
            );
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlightIndex((prev) => Math.max(prev - 1, 0));
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            const item = filteredOptions[highlightIndex];
            if (item) selectItem(item);
        }
    }

    return (
        <div
            className={`smart-select ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
            ref={rootRef}
        >
            <button
                type="button"
                className="smart-select-trigger"
                onClick={() => !disabled && setOpen((prev) => !prev)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
            >
                <span className={`smart-select-value ${value ? '' : 'placeholder'}`}>
                    {value || placeholder}
                </span>
                <span className="smart-select-chevron">⌄</span>
            </button>

            {open && (
                <div className="smart-select-dropdown">
                    <input
                        autoFocus
                        className="smart-select-search"
                        placeholder={searchPlaceholder}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />

                    <div className="smart-select-list" ref={listRef}>
                        {filteredOptions.length ? (
                            filteredOptions.map((item, index) => (
                                <button
                                    key={`${item}-${index}`}
                                    type="button"
                                    className={`smart-select-item ${index === highlightIndex ? 'active' : ''}`}
                                    onMouseEnter={() => setHighlightIndex(index)}
                                    onClick={() => selectItem(item)}
                                >
                                    {item}
                                </button>
                            ))
                        ) : (
                            <div className="smart-select-empty">{emptyText}</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}