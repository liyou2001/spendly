import { StyleSheet, Text, View } from 'react-native';

export default function Placeholder() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Spendly</Text>
      <Text style={styles.subtitle}>Setup works. Features start in Step 2.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: '#2B2420',
    fontSize: 28,
    fontWeight: '500',
  },
  subtitle: {
    color: '#6B5F57',
    fontSize: 15,
    marginTop: 8,
  },
});
