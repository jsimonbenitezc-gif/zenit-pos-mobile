import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Algo salió mal</Text>
          <Text style={styles.detail}>{String(this.state.error?.message || this.state.error)}</Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.btnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#fff' },
  title:     { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 12 },
  detail:    { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 24 },
  btn:       { backgroundColor: '#3b82f6', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  btnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
});
