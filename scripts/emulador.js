#!/usr/bin/env node
/**
 * ABRE ZENIT EN EL EMULADOR DE ANDROID, DE UN SOLO COMANDO.
 *
 *     npm run emulador
 *
 * Arranca el emulador si no está corriendo, espera a que el sistema termine de
 * arrancar y lanza Expo apuntando a él. Expo Go se instala solo, y con la
 * versión que corresponde al SDK del proyecto — que es justo lo que resuelve el
 * "Project is incompatible with this version of Expo Go" que sale al usar el
 * Expo Go de la Play Store (siempre es el del SDK más nuevo, hoy el 57).
 *
 * ── LO QUE EL EMULADOR NO PUEDE PROBAR ──────────────────────────────────────
 * Vale para casi todo, pero NO para:
 *   · la impresora Bluetooth (el emulador no tiene radio);
 *   · las notificaciones push (Expo Go las quitó en el SDK 53);
 *   · el tiempo REAL del PIN sin conexión, que en un teléfono ronda 1 s (§40.4)
 *     y aquí sale mucho más rápido porque corre sobre la PC.
 * Para eso hace falta un teléfono con el APK. Donde el emulador es MEJOR que un
 * teléfono es en el modo local y el arranque sin internet: el modo avión está a
 * un clic y se prueba en segundos.
 */
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');

const SDK = process.env.ANDROID_HOME
    || process.env.ANDROID_SDK_ROOT
    || path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');

const exe = (p) => (process.platform === 'win32' ? p + '.exe' : p);
const ADB = exe(path.join(SDK, 'platform-tools', 'adb'));
const EMULATOR = exe(path.join(SDK, 'emulator', 'emulator'));

const log = (m) => console.log('  ' + m);

function morir(mensaje, consejo) {
    console.error('\n❌ ' + mensaje);
    if (consejo) console.error('   ' + consejo);
    process.exit(1);
}

if (!fs.existsSync(ADB) || !fs.existsSync(EMULATOR)) {
    morir(
        `No se encontró el SDK de Android en:\n     ${SDK}`,
        'Instala Android Studio, o define ANDROID_HOME apuntando al SDK.'
    );
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (...args) => spawnSync(ADB, args, { encoding: 'utf8' }).stdout || '';

/** ¿Hay algo escuchando en este puerto? Se intenta OCUPARLO, que es la única
 *  comprobación fiable: preguntar y luego usarlo deja una ventana de carrera. */
const estaLibre = (puerto) => new Promise((resolver) => {
    const servidor = net.createServer();
    servidor.once('error', () => resolver(false));
    servidor.once('listening', () => servidor.close(() => resolver(true)));
    servidor.listen(puerto, '127.0.0.1');
});

async function puertoLibre(desde, hasta) {
    for (let p = desde; p <= hasta; p++) {
        if (await estaLibre(p)) return p;
    }
    return null;
}

(async () => {
    console.log('\n── Zenit en el emulador de Android ──\n');

    // ¿Ya hay un emulador corriendo?
    const yaVivo = /emulator-\d+\s+device/.test(adb('devices'));

    if (yaVivo) {
        log('Ya hay un emulador corriendo; se reutiliza.');
    } else {
        const avds = spawnSync(EMULATOR, ['-list-avds'], { encoding: 'utf8' })
            .stdout.split('\n').map((s) => s.trim()).filter(Boolean);

        if (!avds.length) {
            morir(
                'No hay ningún dispositivo virtual (AVD) creado.',
                'Ábrelo en Android Studio → Device Manager → Create Device.'
            );
        }

        const avd = process.env.ZENIT_AVD || avds[0];
        log(`Arrancando "${avd}"...`);
        // detached + ignore: el emulador sobrevive a este script, que solo lo lanza
        spawn(EMULATOR, ['-avd', avd], { detached: true, stdio: 'ignore' }).unref();

        adb('wait-for-device');
        let arrancado = false;
        for (let i = 0; i < 60; i++) {
            if (adb('shell', 'getprop', 'sys.boot_completed').trim() === '1') { arrancado = true; break; }
            await dormir(5000);
        }
        if (!arrancado) morir('El emulador no terminó de arrancar en 5 minutos.');
        log('Emulador listo.');
    }

    // ⚠️ SE BUSCA UN PUERTO LIBRE, NO SE FIJA UNO.
    //
    // Expo pregunta "¿uso el siguiente puerto?" cuando el suyo está tomado, y en
    // modo no interactivo esa pregunta **aborta el arranque** con un mensaje que
    // no dice qué hacer. Y quedan Metros colgados con facilidad: basta cerrar la
    // terminal sin cortar el proceso. Fijar un puerto solo mueve el problema del
    // 8081 al 8082 — se comprobó en vivo.
    const puerto = process.env.RCT_METRO_PORT || String(await puertoLibre(8081, 8099));
    if (!puerto) morir('No hay ningún puerto libre entre el 8081 y el 8099.');
    log(`Lanzando Expo en el puerto ${puerto} (Expo Go se instala solo si falta)...\n`);

    // ⚠️ `shell: true` en Windows y no es opcional: desde Node 20, lanzar un `.cmd`
    // sin shell falla con EINVAL (una mitigación de seguridad de la CVE de
    // argument-injection). Sin esto el comando muere antes de arrancar Expo.
    const expo = spawn(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['expo', 'start', '--android', '--port', puerto],
        {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..'),
            shell: process.platform === 'win32',
        }
    );
    expo.on('exit', (c) => process.exit(c ?? 0));
})();
