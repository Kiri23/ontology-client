import { sondear } from "./diagnostico-webgpu-sonda.js";
sondear().then((r) => self.postMessage(r));
