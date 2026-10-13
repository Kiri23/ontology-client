// servidor-mudo.ts — acepta conexiones TCP y nunca responde: para probar el timeout del cliente.

/** Escucha en un puerto libre de 127.0.0.1. `cerrar()` suelta el puerto y las conexiones abiertas. */
export function servidorMudo(): { url: string; cerrar: () => void } {
  const oyente = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const conexiones: Deno.Conn[] = [];
  (async () => {
    try {
      for await (const conexion of oyente) conexiones.push(conexion); // ni lee ni escribe
    } catch {
      // cerrado
    }
  })();
  return {
    url: `http://127.0.0.1:${oyente.addr.port}`,
    cerrar: () => {
      for (const c of conexiones) {
        try {
          c.close();
        } catch {
          // ya cerrada
        }
      }
      oyente.close();
    },
  };
}
