import React, { useState } from 'react';
import { SafeAreaView } from 'react-native';
import LoginScreen from './src/screens/LoginScreen';
import ChatScreen from './src/screens/ChatScreen';

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [token, setToken] = useState<string | null>(null);

  function handleLoginSuccess(loggedUser: any, accessToken: string) {
    setUser(loggedUser);
    setToken(accessToken);
  }

  function handleLogout() {
    setUser(null);
    setToken(null);
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      {!user ? (
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      ) : (
        <ChatScreen user={user} onLogout={handleLogout} />
      )}
    </SafeAreaView>
  );
}
