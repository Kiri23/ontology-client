// El token de una historia que lo pide, guardado solo en sessionStorage. Que no termine en el gestor de contraseñas:
//
// - Va fuera del <form> de los controles (PanelHistoria): los navegadores ofrecen guardar un password al enviar el
//   form que lo contiene.
// - Donde el navegador enmascara un campo de texto (-webkit-text-security: Chrome, Edge, Safari) es type="text" con
//   máscara: los gestores solo miran los type="password", y Chrome ignora autocomplete="off" en esos. Donde no (algún
//   Firefox), queda type="password" y lo de arriba más autocomplete="off".
// - data-1p-ignore, data-lpignore, data-bwignore y data-form-type: la forma de 1Password, LastPass, Bitwarden y Dashlane
//   de decir "este campo no".
import type { Token } from "../historias/index.ts";

const SECRET: Record<Token, string> = {
  acciones: "ONTOLOGY_ACCIONES_TOKEN",
  proyectos: "ONTOLOGY_PROYECTOS_TOKEN",
};

const MASCARA = typeof CSS !== "undefined" && !!CSS.supports?.("-webkit-text-security", "disc");

interface Props {
  tipo: Token;
  valor: string;
  guardar: (valor: string) => void;
  /** La ayuda ("Dónde queda el token") arranca abierta: en pantalla ancha sí, en el teléfono plegada (diseno.md). */
  ayudaAbierta?: boolean;
}

export function CampoToken({ tipo, valor, guardar, ayudaAbierta = false }: Props) {
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
          type={MASCARA ? "text" : "password"}
          className={MASCARA ? "token-mascara" : undefined}
          value={valor}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore=""
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
          placeholder="pegalo acá"
          onChange={(e) => guardar(e.target.value.trim())}
        />
        {valor && <button type="button" className="boton-texto" onClick={() => guardar("")}>olvidar</button>}
      </div>
      <details className="token-ayuda" open={ayudaAbierta}>
        <summary>Dónde queda el token</summary>
        <p>
          En el sessionStorage de esta pestaña, y sale solo en el header Authorization del pedido. Al cerrar la pestaña
          se va. La página no le ofrece al navegador guardarlo.
        </p>
      </details>
    </div>
  );
}
