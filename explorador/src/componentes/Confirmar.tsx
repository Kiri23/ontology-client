// La confirmación antes de correr una historia que escribe: qué función, contra qué servidor y con qué valores. Los
// valores pueden venir de un link compartido (#/jobs.descartar?link=…&porque=…): se muestran para que nadie confirme a
// ciegas.
import type { Historia, Valores } from "../historias/index.ts";

interface Props {
  historia: Historia;
  valores: Valores;
  host: string;
  confirmar: () => void;
  cancelar: () => void;
}

export function Confirmar({ historia, valores, host, confirmar, cancelar }: Props) {
  return (
    <div className="confirmar" role="alert">
      <p className="confirmar-titulo">Esto escribe en producción</p>
      <p>
        <code>{historia.funcion}</code> cambia los datos de <strong>{host}</strong>, con:
      </p>
      <dl className="confirmar-valores">
        {historia.controles.map((c) => (
          <div key={c.nombre}>
            <dt>{c.nombre}</dt>
            <dd>{valores[c.nombre]?.trim() || "—"}</dd>
          </div>
        ))}
      </dl>
      <p>No se deshace desde acá.</p>
      <div className="confirmar-botones">
        <button type="button" className="boton-peligro" onClick={confirmar}>Sí, escribir</button>
        <button type="button" className="boton-texto" onClick={cancelar}>Cancelar</button>
      </div>
    </div>
  );
}
