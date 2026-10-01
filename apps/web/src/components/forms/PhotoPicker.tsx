import { useState } from "react";
export function PhotoPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [error, setError] = useState("");
  return (
    <div className="photo-picker">
      <div className="family-photo-row">
        {value ? (
          <img className="family-avatar-preview" src={value} alt="Foto selecionada" />
        ) : (
          <span className="family-avatar-preview family-avatar-placeholder">⌂</span>
        )}
        <label>
          Foto (opcional)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setError("");
              if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000) {
                setError("Use PNG, JPG ou WebP de até 2 MB.");
                return;
              }
              const reader = new FileReader();
              reader.onerror = () => setError("Não foi possível ler a imagem.");
              reader.onload = () => onChange(String(reader.result));
              reader.readAsDataURL(file);
            }}
          />
        </label>
      </div>
      {value && (
        <button type="button" className="text-button" onClick={() => onChange(null)}>
          Remover foto
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
