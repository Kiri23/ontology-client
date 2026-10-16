// Un botón que copia un texto al portapapeles y dice "Copiado" un momento.
import { useEffect, useState } from "react";

export function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [estado, setEstado] = useState<"quieto" | "copiado" | "fallo">("quieto");
  useEffect(() => {
    if (estado === "quieto") return;
    const reloj = setTimeout(() => setEstado("quieto"), 1800);
    return () => clearTimeout(reloj);
  }, [estado]);
  const copiar = () =>
    navigator.clipboard?.writeText(texto).then(() => setEstado("copiado"), () => setEstado("fallo")) ??
      setEstado("fallo");
  return (
    <button type="button" className="boton-secundario" onClick={copiar} aria-live="polite">
      {estado === "copiado" ? "Copiado" : estado === "fallo" ? "No se pudo copiar" : rotulo}
    </button>
  );
}
