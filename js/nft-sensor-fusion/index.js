/**
 * nft-sensor-fusion - Main Entry Point
 */

async function isSimdSupported() {
    try {
        return await WebAssembly.validate(new Uint8Array([
            0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
            10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
        ]));
    } catch (e) {
        return false;
    }
}

export async function loadNftSensorFusion(config = {}) {
    const hasSimd = await isSimdSupported();

    // Calcola il percorso base relativo a questo file (index.js)
    const baseUrl = new URL('./dist/', import.meta.url).href;

    let modulePath;
    if (hasSimd) {
        console.log('[NftSensorFusion] Loading SIMD build');
        modulePath = new URL('nft_sensor_fusion_simd.js', baseUrl).href;
    } else {
        console.log('[NftSensorFusion] Loading Standard build');
        modulePath = new URL('nft_sensor_fusion.js', baseUrl).href;
    }

    // Import dinamico del modulo ES6
    const moduleNamespace = await import(modulePath);

    // Ora .default SARA' definito grazie a -s EXPORT_ES6=1
    const ModuleFactory = moduleNamespace.default;

    // Emscripten con ES6 solitamente risolve il wasm da solo usando import.meta.url
    // interno al file generato. Tuttavia, passiamo config per sicurezza.
    return ModuleFactory(config);
}