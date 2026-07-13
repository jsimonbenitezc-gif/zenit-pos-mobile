import { View, Text, Image, StyleSheet } from 'react-native';
import { spacing } from '../theme';

const logo = require('../../assets/logo.png');

// Encabezado de sección: logo pequeño de Zenit + título.
// Reemplaza al <Text style={styles.title}> de cada pantalla para dar identidad
// consistente. Recibe `titleStyle` para conservar la tipografía propia de cada
// pantalla (p. ej. Resumen usa un título más grande).
export default function LogoTitle({ title, titleStyle, size = 26, style }) {
  return (
    <View style={[styles.row, style]}>
      <Image
        source={logo}
        style={[styles.logo, { width: size, height: size }]}
        resizeMode="contain"
      />
      <Text style={titleStyle} numberOfLines={1}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  logo: { marginRight: spacing.sm },
});
