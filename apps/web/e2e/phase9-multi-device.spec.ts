/**
 * Tests E2E pour les scénarios multi-appareils
 * Phase 9: Multi-appareils - DoD validation
 */

import { test, expect, Page } from '@playwright/test';

test.describe('Phase 9: Multi-Device Scenarios', () => {
  let page1: Page;
  let page2: Page;
  let userEmail: string;
  let userId: string;

  test.beforeAll(async ({ browser }) => {
    // Créer deux instances de navigateur pour simuler deux appareils
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    page1 = await context1.newPage();
    page2 = await context2.newPage();

    userEmail = `test-${Date.now()}@example.com`;
  });

  test('Scénario 1: Ajouter un appareil via QR code', async () => {
    // 1. Se connecter sur l'appareil 1
    await page1.goto('/login');
    await page1.fill('input[name="email"]', userEmail);
    await page1.fill('input[name="password"]', 'Test123!');
    await page1.click('button:has-text("Se connecter")');
    await expect(page1).toHaveURL('/chat');

    // 2. Aller à la gestion des appareils
    await page1.click('button:has-text("Paramètres")');
    await page1.click('a:has-text("Appareils")');

    // 3. Cliquer sur "Lier un appareil"
    await page1.click('button:has-text("Lier un appareil")');
    await expect(page1.locator('text=Lier un nouvel appareil')).toBeVisible();

    // 4. Récupérer le secret
    const secretLocator = page1.locator('code');
    const secret = await secretLocator.textContent();
    expect(secret).toBeTruthy();

    // 5. Sur l'appareil 2, se connecter et utiliser le secret
    await page2.goto('/login');
    await page2.fill('input[name="email"]', userEmail);
    await page2.fill('input[name="password"]', 'Test123!');
    await page2.click('button:has-text("Se connecter")');

    // Le flux devrait demander d'entrer le code de liaison
    await expect(page2.locator('text=Lier cet appareil')).toBeVisible();
    await page2.fill('input[placeholder*="code"]', secret!);
    await page2.click('button:has-text("Confirmer")');

    // 6. Vérifier que le nouvel appareil est enregistré
    await page2.goto('/chat/settings/devices');
    await expect(page2.locator('text=Cet appareil')).toBeVisible();

    // Sur l'appareil 1, vérifier que le nouvel appareil apparaît
    await page1.reload();
    const deviceList = page1.locator('text=Mes appareils').locator('..').locator('..').locator('div');
    await expect(deviceList).toContainText(new RegExp('2 appareils?'));
  });

  test('Scénario 2: Synchronisation de l\'état de lecture', async () => {
    // Prérequis: deux appareils connectés et une conversation ouverte

    // 1. Appareil 1: Envoyer un message
    await page1.goto('/chat/direct-123'); // Conversation avec Bob
    await page1.fill('input[placeholder*="Message"]', 'Test sync');
    await page1.click('button:has-text("Envoyer")');
    await expect(page1.locator('text=Test sync')).toBeVisible();

    // 2. Appareil 2: Ouvrir la même conversation
    await page2.goto('/chat/direct-123');

    // 3. Appareil 1: Lire le message
    const message = page1.locator('text=Test sync');
    await message.hover();
    // Le message devrait être marqué comme lu après quelques secondes

    // 4. Attendre la synchronisation
    await page1.waitForTimeout(2000);

    // 5. Appareil 2: Vérifier que le message est marqué comme lu
    await expect(page2.locator('text=Test sync')).toHaveClass(/read/);
  });

  test('Scénario 3: Révoquer un appareil', async () => {
    // 1. Vérifier que les deux appareils sont connectés
    await page1.goto('/chat/settings/devices');
    let deviceCount = page1.locator('div[class*="device"]').count();
    expect(await deviceCount).toBe(2);

    // 2. Révoquer l'appareil 2 depuis l'appareil 1
    const revokeButtons = page1.locator('button:has-text("Révoquer")');
    const count = await revokeButtons.count();
    if (count > 0) {
      // Cliquer sur le dernier bouton de révocation
      await revokeButtons.nth(count - 1).click();
      await page1.click('button:has-text("Confirmer")');
    }

    // 3. Attendre la synchronisation
    await page1.waitForTimeout(2000);

    // 4. Vérifier que l'appareil 2 est plus connecté
    await page2.goto('/chat');
    await expect(page2).toHaveURL('/login'); // Redirigé vers login

    // 5. Appareil 1: Vérifier que l'appareil a été retiré de la liste
    await page1.reload();
    deviceCount = page1.locator('div[class*="device"]').count();
    expect(await deviceCount).toBe(1);
  });

  test('Scénario 4: Cache hors ligne', async () => {
    // 1. Charger une conversation
    await page1.goto('/chat/direct-123');
    await expect(page1.locator('text=Message de test')).toBeVisible();

    // 2. Passer hors ligne
    await page1.context().setOffline(true);

    // 3. Vérifier que les messages sont toujours visibles (depuis le cache)
    await expect(page1.locator('text=Message de test')).toBeVisible();

    // 4. Vérifier qu'on ne peut pas envoyer de message
    const sendButton = page1.locator('button:has-text("Envoyer")');
    await expect(sendButton).toBeDisabled();

    // 5. Revenir en ligne
    await page1.context().setOffline(false);

    // 6. Vérifier que les messages sont synchronisés
    await page1.waitForTimeout(2000);
    const sendButtonAfter = page1.locator('button:has-text("Envoyer")');
    await expect(sendButtonAfter).toBeEnabled();
  });

  test('Scénario 5: Recovery après perte d\'appareil', async () => {
    // Prérequis: L'utilisateur a deux appareils

    // 1. L'utilisateur veut récupérer son compte après avoir perdu un appareil
    await page1.goto('/login');
    await page1.click('a:has-text("J\'ai perdu l\'accès à mon compte")');

    // 2. Entrer l'email
    await page1.fill('input[name="email"]', userEmail);
    await page1.click('button:has-text("Continuer")');

    // 3. Vérifier que les options de recovery s'affichent
    // - Utiliser un autre appareil
    // - Utiliser une clé de secours
    await expect(page1.locator('text=Utiliser un autre appareil')).toBeVisible();

    // 4. Cliquer sur "Utiliser un autre appareil"
    await page1.click('text=Utiliser un autre appareil');

    // 5. Sur l'appareil 2, on recoit une notification de recovery
    // (Cette partie est simplifiée pour le test)
    await page2.goto(`/auth/recovery?email=${userEmail}`);
    await page2.click('button:has-text("Approuver")');

    // 6. Appareil 1 reçoit l'approbation et peut se connecter
    await expect(page1).toHaveURL('/chat');
  });

  test.afterAll(async () => {
    await page1.close();
    await page2.close();
  });
});
