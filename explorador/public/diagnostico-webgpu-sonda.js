// La sonda de WebGPU: corre igual en la página y en un worker (diagnostico-webgpu.js la importa en los dos). Dice si
// hay adaptador, quién es (adapter.info), si da un device, y si un compute shader mínimo escribe lo que debe: el modelo
// de la AI corre entero en compute shaders, y en el PowerVR del Pixel 10 Chrome todavía los tiene con workarounds
// (playcanvas/engine#8874).
const WGSL = `
@group(0) @binding(0) var<storage, read_write> datos: array<u32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x < arrayLength(&datos)) { datos[id.x] = id.x * 2u; }
}`;

export async function sondear() {
  const r = {
    hilo: typeof window === "undefined" ? "worker" : "pagina",
    gpu: !!navigator.gpu,
  };
  if (!navigator.gpu) return r;
  try {
    // Primero el modo core, que es el que piden Transformers.js y onnxruntime. En el Pixel 10 Chrome solo da
    // adaptador en modo compatibilidad (webgpureport del 2026-10-16): un subconjunto de WebGPU sobre OpenGL ES.
    let adaptador = await navigator.gpu.requestAdapter();
    r.modo = adaptador ? "core" : null;
    if (!adaptador) {
      adaptador = await navigator.gpu.requestAdapter({
        featureLevel: "compatibility",
      });
      r.modo = adaptador ? "compatibility" : null;
    }
    r.adaptador = !!adaptador;
    if (!adaptador) return r;
    r.f16 = adaptador.features.has("shader-f16");
    r.subgroups = adaptador.features.has("subgroups");
    const info = adaptador.info ?? {};
    r.info = {
      vendor: info.vendor,
      architecture: info.architecture,
      device: info.device,
      description: info.description,
    };
    r.fallback = adaptador.isFallbackAdapter;
    r.limites = {
      maxBufferSize: adaptador.limits.maxBufferSize,
      maxStorageBufferBindingSize: adaptador.limits.maxStorageBufferBindingSize,
    };
    r.features = [...adaptador.features].sort();
    const device = await adaptador.requestDevice();
    r.device = true;
    r.compute = await computar(device);
    device.destroy();
  } catch (e) {
    r.error = `${e?.name ?? ""}: ${e?.message ?? e}`;
  }
  return r;
}

async function computar(device) {
  const n = 256;
  const buffer = device.createBuffer({
    size: n * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const lectura = device.createBuffer({
    size: n * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: WGSL }),
      entryPoint: "main",
    },
  });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer } }],
  });
  const enc = device.createCommandEncoder();
  const pase = enc.beginComputePass();
  pase.setPipeline(pipeline);
  pase.setBindGroup(0, bind);
  pase.dispatchWorkgroups(Math.ceil(n / 64));
  pase.end();
  enc.copyBufferToBuffer(buffer, 0, lectura, 0, n * 4);
  device.queue.submit([enc.finish()]);
  await lectura.mapAsync(GPUMapMode.READ);
  const datos = new Uint32Array(lectura.getMappedRange());
  let malos = 0;
  for (let i = 0; i < n; i++) if (datos[i] !== i * 2) malos++;
  lectura.unmap();
  return malos === 0 ? "ok" : `${malos} de ${n} valores mal`;
}
