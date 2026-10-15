// Los controles de una historia: un campo por parámetro, con el tipo que declara la historia. Controlados: los
// valores viven en la URL (useRuta), así un link reproduce la llamada.
import type { Control, Valores } from "../historias/index.ts";

interface Props {
  idHistoria: string;
  controles: Control[];
  valores: Valores;
  cambiar: (nombre: string, valor: string) => void;
}

export function Controles({ idHistoria, controles, valores, cambiar }: Props) {
  if (!controles.length) return <p className="sin-controles">Sin parámetros: se corre tal cual.</p>;
  return (
    <div className="controles">
      {controles.map((c) => {
        const id = `${idHistoria}-${c.nombre}`;
        const lista = c.sugerencias?.length ? `${id}-sugerencias` : undefined;
        const comun = {
          id,
          name: c.nombre,
          value: valores[c.nombre] ?? "",
          required: c.requerido,
          spellCheck: false,
          autoComplete: "off",
        };
        return (
          <div key={c.nombre} className="control" data-tipo={c.tipo}>
            <label htmlFor={id}>
              <span className="control-nombre">{c.nombre}</span>
              {c.requerido
                ? <span className="control-req">requerido</span>
                : <span className="control-opc">opcional</span>}
            </label>
            {c.tipo === "texto"
              ? <input {...comun} type="text" list={lista} onChange={(e) => cambiar(c.nombre, e.target.value)} />
              : (
                <textarea
                  {...comun}
                  rows={c.tipo === "parrafo" ? 8 : 3}
                  placeholder={c.tipo === "pares" ? "clave=valor, uno por línea" : undefined}
                  onChange={(e) => cambiar(c.nombre, e.target.value)}
                />
              )}
            {lista && (
              <datalist id={lista}>
                {c.sugerencias!.map((s) => <option key={s} value={s} />)}
              </datalist>
            )}
            {c.descripcion && <p className="control-ayuda">{c.descripcion}</p>}
          </div>
        );
      })}
    </div>
  );
}
