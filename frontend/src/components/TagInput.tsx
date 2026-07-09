import { useState, type KeyboardEvent } from 'react';

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export default function TagInput({ value, onChange, placeholder = 'הוסף תג ולחץ פסיק...' }: Props) {
  const [input, setInput] = useState('');

  function addTag(raw: string) {
    const tag = raw.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
  }

  function handleChange(text: string) {
    if (text.endsWith(',')) {
      addTag(text.slice(0, -1));
      setInput('');
    } else {
      setInput(text);
    }
  }

  function handleBlur() {
    if (input.trim()) {
      addTag(input);
      setInput('');
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && input === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function removeTag(tag: string) {
    onChange(value.filter(t => t !== tag));
  }

  return (
    <div className="tag-input-container">
      {value.map(tag => (
        <span key={tag} className="tag-input-chip">
          {tag}
          <button type="button" className="tag-remove" onClick={() => removeTag(tag)}>✕</button>
        </span>
      ))}
      <input
        className="tag-input-field"
        value={input}
        placeholder={value.length === 0 ? placeholder : ''}
        onChange={e => handleChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
