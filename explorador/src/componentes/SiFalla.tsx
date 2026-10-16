// Un ErrorBoundary para la vista Grafo: si falla el import() de su chunk (una pestaña vieja después de un deploy pide
// un VistaGrafo-<hash> que ya no existe, o se cayó la red) o algo tira mientras dibuja, en vez de la página en blanco
// dice qué pasó y cómo seguir. React solo atrapa errores de render con una clase.
import { Component, type ReactNode } from "react";
import "../estilos/estado.css";

interface Props {
  children: ReactNode;
}

export class SiFalla extends Component<Props, { error?: Error }> {
  override state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="grafo-error" role="alert">
        <p className="grafo-error-titulo">No se pudo abrir la vista Grafo</p>
        <p>{error.message}</p>
        <p>
          Si hubo un deploy nuevo, esta pestaña tiene la versión vieja: recargá la página. Las historias del SDK, en la
          barra, siguen andando.
        </p>
        <button type="button" className="boton-correr" onClick={() => location.reload()}>Recargar</button>
      </div>
    );
  }
}
