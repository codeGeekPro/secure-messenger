# Certificate Pinning Mobile (iOS/Android)

## Objectif
Prévenir les attaques MITM (Man-In-The-Middle) en validant les certificats du serveur côté client.

## Approche

### iOS (React Native / Expo)
- Utiliser `expo-dev-client` + config plugin pour NSURLSession avec pinning.
- Alternativement: native module Swift avec `TrustKit`.
- Certificat public du serveur (`.cer`) embarqué dans l'app.
- Validation du hash SHA-256 de la clé publique du certificat.

### Android
- Configurer `network_security_config.xml` dans `android/app/src/main/res/xml/`.
- Ajouter les hashes de certificats dans `<pin-set>`.
- Déclarer dans `AndroidManifest.xml` : `android:networkSecurityConfig="@xml/network_security_config"`.

## Exemple Android (`network_security_config.xml`)

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config>
    <domain includeSubdomains="true">api.securemessenger.example</domain>
    <pin-set>
      <pin digest="SHA-256">HASH_BASE64_DU_CERTIFICAT_SERVEUR</pin>
      <!-- Backup pin -->
      <pin digest="SHA-256">HASH_BASE64_BACKUP</pin>
    </pin-set>
  </domain-config>
</network-security-config>
```

## Tests MITM

### Outil: mitmproxy

1. Installer: `pip install mitmproxy`
2. Lancer proxy: `mitmproxy -p 8080`
3. Configurer device pour proxy HTTP : `localhost:8080`
4. Tester connexion app → serveur
5. Résultat attendu : **connexion échouée** si pinning actif.

### Test automatisé

- Script Python qui lance mitmproxy et tente d'intercepter les requêtes.
- Vérifier que l'app rejette les certificats non épinglés.

## DoD Phase 5

- [ ] Config pinning iOS (TrustKit ou config plugin)
- [ ] Config pinning Android (`network_security_config.xml`)
- [ ] Test manuel mitmproxy (connexion doit échouer)
- [ ] Test automatisé CI : script qui valide le rejet

## Références

- [Android Network Security Config](https://developer.android.com/training/articles/security-config)
- [TrustKit (iOS)](https://github.com/datatheorem/TrustKit)
- [mitmproxy](https://mitmproxy.org/)
