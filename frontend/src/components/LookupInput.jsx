import { useEffect, useRef, useState } from 'react';

export default function LookupInput({ label, value, onChange, onCreate, loadOptions, placeholder, required = false }) {
  const [input, setInput] = useState(value || '');
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const cacheRef = useRef(new Map());

  useEffect(() => {
    setInput(value || '');
  }, [value]);

  useEffect(() => {
    let active = true;
    const key = (input || '').trim().toLowerCase();

    if (cacheRef.current.has(key)) {
      setOptions(cacheRef.current.get(key));
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await loadOptions(input || '');
        if (!active) return;
        cacheRef.current.set(key, result || []);
        setOptions(result || []);
      } catch {
        if (active) setOptions([]);
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [input, loadOptions]);

  return (
    <label className="field">
      <span>{label}{required ? ' *' : ''}</span>
      <div className="lookup">
        <input
          value={input}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            const next = e.target.value;
            setInput(next);
            onChange(next);
          }}
        />
        {open && (
          <div className="lookup-menu">
            {options.map((item) => (
              <button
                key={item.id}
                type="button"
                className="lookup-item"
                onClick={() => {
                  setInput(item.name);
                  onChange(item.name);
                  setOpen(false);
                }}
              >
                {item.name}
              </button>
            ))}
            {input.trim() && !options.some((item) => item.name === input.trim()) && (
              <button
                type="button"
                className="lookup-create"
                onClick={async () => {
                  const created = await onCreate(input.trim());
                  cacheRef.current.clear();
                  setInput(created.name);
                  onChange(created.name);
                  setOpen(false);
                }}
              >
                הוסף חדש: {input}
              </button>
            )}
          </div>
        )}
      </div>
    </label>
  );
}
