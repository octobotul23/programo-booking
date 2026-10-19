import { Field, Toggle } from './ui.jsx';

/** Renders one owner-defined booking-form question. */
export function CustomFieldInput({ field, value, onChange, showRequired }) {
  const label = `${field.label}${showRequired && field.required ? ' *' : ''}`;
  if (field.type === 'checkbox') {
    return (
      <div className="flex items-end">
        <Toggle checked={!!value} onChange={onChange} label={label} />
      </div>
    );
  }
  const common = { className: 'input', value: value ?? '', onChange: (e) => onChange(e.target.value), required: showRequired && field.required };
  return (
    <Field label={label} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
      {field.type === 'textarea' ? (
        <textarea {...common} />
      ) : field.type === 'select' ? (
        <select {...common}>
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input {...common} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} />
      )}
    </Field>
  );
}
