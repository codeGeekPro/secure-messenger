import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { apiClient } from '../lib/api';

interface LoginScreenProps {
  onLoginSuccess: (user: any, token: string) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSendOtp() {
    if (!phone.trim() || !displayName.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.signup(phone, displayName);
      if (res.success) {
        setStep('otp');
      } else {
        Alert.alert('Erreur', res.error || 'Échec de l\'envoi OTP');
      }
    } catch (err) {
      Alert.alert('Erreur', 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!code.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer le code OTP');
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.verifyOtp(phone, code);
      if (res.success && res.data) {
        apiClient.setToken(res.data.accessToken);
        onLoginSuccess(res.data.user, res.data.accessToken);
      } else {
        Alert.alert('Erreur', res.error || 'Code OTP invalide');
      }
    } catch (err) {
      Alert.alert('Erreur', 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Secure Messenger</Text>
        <Text style={styles.subtitle}>Connexion sécurisée (E2E)</Text>

        {step === 'phone' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Numéro de téléphone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Nom d'affichage"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendOtp}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Envoi...' : 'Envoyer code OTP'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.info}>Code envoyé au {phone}</Text>
            <TextInput
              style={styles.input}
              placeholder="Code OTP"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Vérification...' : 'Vérifier'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('phone')}>
              <Text style={styles.link}>Modifier le numéro</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  info: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    color: '#4f46e5',
    textAlign: 'center',
    fontSize: 14,
  },
});
