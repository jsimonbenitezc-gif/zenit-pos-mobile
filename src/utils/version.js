import Constants from 'expo-constants';

// La versión que se le enseña al usuario. Sale del "version" de app.json, que
// EAS mete DENTRO del APK al compilar: así el número dice qué binario está
// instalado, no lo que alguien se acordó de escribir en una pantalla.
// Se sube junto con la del desktop (package.json de zenit-pos-desktop) antes
// de cada `eas build`, para que las dos apps de una misma release digan lo mismo.
export const VERSION_APP = Constants.expoConfig?.version || '—';
