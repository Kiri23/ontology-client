// El token de una historia que lo pide. Tipo password, sin autocompletar, y guardado solo en sessionStorage.
import type { Token } from "../historias/index.ts";

const SECRET: Record<Token, string> = {
  acciones: "ONTOLOGY_ACCIONES_TOKEN",
  proyectos: "ONTOLOGY_PROYECTOS_TOKEN",
};

interface Props {
  tipo: Token;
  valor: string;
  guardar: (valor: string) => void;
}

export function CampoToken({ tipo, valor, guardar }: Props) {
  const id = `token-${tipo}`;
  return (
    <div className="token">
      <label htmlFor={id}>
        <span className="control-nombre">token de {tipo}</span>
        <span className="token-secret">{SECRET[tipo]}</span>
      </label>
      <div className="token-fila">
        <input
          id={id}
          type="password"
          value={valor}
          autoComplete="off"
          spellCheck={false}
          placeholder="pegalo acá"
          onChange={(e) => guardar(e.target.value.trim())}
        />
        {valor && <button type="button" className="boton-texto" onClick={() => guardar("")}>olvidar</button>}
      </div>
      <p className="control-ayuda">
        Vive en el sessionStorage de esta pestaña y sale solo en el header Authorization del pedido. Al cerrar la
        pestaña se va.
      </p>
    </div>
  );
}
