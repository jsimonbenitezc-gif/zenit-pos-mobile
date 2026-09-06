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

    // El 8081 suele estar tomado por otro Metro. Expo pregunta si usar otro, y
    // en modo no interactivo eso ABORTA el arranque sin explicar gran cosa.
    const puerto = process.env.RCT_METRO_PORT || '8082';
    log(`Lanzando Expo en el puerto ${puerto} (Expo Go se instala solo si falta)...\n`);

    const expo = spawn(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['expo', 'start', '--android', '--port', puerto],
        { stdio: 'inherit', cwd: path.join(__dirname, '..') }
    );
    expo.on('exit', (c) => process.exit(c ?? 0));
})();
