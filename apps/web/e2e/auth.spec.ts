import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/');
    
    // Vérifier que la page de connexion s'affiche
    await expect(page).toHaveTitle(/Secure Messenger/);
    
    // Vérifier la présence des éléments de connexion
    const loginButton = page.locator('button:has-text("Se connecter")');
    await expect(loginButton).toBeVisible();
  });

  test('should navigate to registration', async ({ page }) => {
    await page.goto('/');
    
    // Cliquer sur le lien d'inscription si présent
    const registerLink = page.locator('a:has-text("S\'inscrire")');
    if (await registerLink.isVisible()) {
      await registerLink.click();
      await expect(page).toHaveURL(/.*register/);
    }
  });

  test('should show validation errors for invalid login', async ({ page }) => {
    await page.goto('/');
    
    // Essayer de se connecter avec des champs vides
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const loginButton = page.locator('button[type="submit"]');
    
    if (await emailInput.isVisible()) {
      await emailInput.fill('invalid-email');
      await passwordInput.fill('123');
      await loginButton.click();
      
      // Vérifier qu'un message d'erreur s'affiche
      const errorMessage = page.locator('text=/invalid|erreur|error/i');
      await expect(errorMessage).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Chat Interface', () => {
  test.skip('should display chat interface after login', async ({ page }) => {
    // Ce test nécessite un utilisateur authentifié
    // À implémenter avec un système de fixtures ou de login automatique
    await page.goto('/chat');
    
    // Vérifier les éléments de l'interface de chat
    const conversationList = page.locator('[data-testid="conversation-list"]');
    await expect(conversationList).toBeVisible({ timeout: 10000 });
  });
});
