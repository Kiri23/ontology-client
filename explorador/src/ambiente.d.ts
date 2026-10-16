// Lo que TypeScript no sabe solo.

// El JSDoc y las firmas del SDK, del plugin vite/doc-sdk.ts.
declare module "virtual:doc-sdk" {
  const doc: import("../vite/doc-sdk.ts").DocSdk;
  export default doc;
}

// jobs.ts (el SDK, que es de Deno) lee ONTOLOGY_ACCIONES_TOKEN con `globalThis.Deno` si existe. En el navegador no
// existe y la función devuelve undefined; esto es solo para que el tipo `typeof Deno` compile acá.
declare const Deno: {
  permissions?: { querySync?(descriptor: { name: "env"; variable?: string }): { state: string } };
  env?: { get?(clave: string): string | undefined };
};
