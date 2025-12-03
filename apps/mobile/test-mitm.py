#!/usr/bin/env python3
"""
Test MITM basique pour valider le certificate pinning.
Lance mitmproxy et tente d'intercepter les requêtes de l'app mobile.

Résultat attendu : l'app doit rejeter les connexions si pinning actif.
"""
import subprocess
import sys
import time

def test_mitm():
    print("🔒 Test MITM Certificate Pinning")
    print("1. Lancement de mitmproxy sur port 8080...")
    
    # Lance mitmproxy en background
    proc = subprocess.Popen(
        ["mitmproxy", "-p", "8080", "--quiet"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    time.sleep(3)
    
    print("2. Configurer le device pour utiliser proxy localhost:8080")
    print("3. Lancer l'app mobile et tenter une connexion")
    print("4. Vérifier les logs de mitmproxy")
    print("\n✅ Si pinning actif: connexion échouée, aucune requête interceptée")
    print("❌ Si pinning inactif: requêtes visibles dans mitmproxy\n")
    
    try:
        input("Appuyer sur Entrée pour terminer le test...")
    finally:
        proc.terminate()
        proc.wait()
        print("✅ Test terminé")

if __name__ == "__main__":
    try:
        test_mitm()
    except KeyboardInterrupt:
        print("\n⚠️  Test interrompu")
        sys.exit(1)
    except FileNotFoundError:
        print("❌ mitmproxy non installé. Installer avec: pip install mitmproxy")
        sys.exit(1)
