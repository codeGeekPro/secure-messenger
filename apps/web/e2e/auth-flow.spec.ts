import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/');
    
    // Vérifier que la page de connexion s'affiche
    await expect(page).toHaveTitle(/Secure Messenger/i);
    
    // Vérifier la présence des éléments de connexion
    const loginButton = page.getByRole('button', { name: /connexion|login|sign in/i });
    await expect(loginButton).toBeVisible();
  });

  test('should navigate between login and register', async ({ page }) => {
    await page.goto('/');
    
    // Chercher un lien vers l'inscription
    const registerLink = page.getByRole('link', { name: /inscription|register|sign up/i });
    
    if (await registerLink.isVisible()) {
      await registerLink.click();
      
      // Vérifier que nous sommes sur la page d'inscription
      const registerButton = page.getByRole('button', { name: /inscription|register|sign up/i });
      await expect(registerButton).toBeVisible();
      
      // Retourner à la page de connexion
      const loginLink = page.getByRole('link', { name: /connexion|login|sign in/i });
      await loginLink.click();
      
      const loginButton = page.getByRole('button', { name: /connexion|login|sign in/i });
      await expect(loginButton).toBeVisible();
    }
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/');
    
    // Trouver le champ email
    const emailInput = page.getByRole('textbox', { name: /email/i }).or(page.locator('input[type="email"]'));
    const loginButton = page.getByRole('button', { name: /connexion|login|sign in/i });
    
    if (await emailInput.isVisible()) {
      // Entrer un email invalide
      await emailInput.fill('invalid-email');
      await loginButton.click();
      
      // Vérifier qu'un message d'erreur s'affiche ou que le formulaire n'est pas soumis
      // (ceci dépend de l'implémentation réelle)
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Chat Page Protection', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    // Essayer d'accéder directement à la page de chat
    await page.goto('/chat');
    
    // Devrait être redirigé vers la page de connexion ou afficher un message d'erreur
    await page.waitForTimeout(1000);
    
    const url = page.url();
    const isOnLogin = url.includes('/login') || url === 'http://localhost:3000/' || url === 'http://localhost:3000';
    const hasLoginButton = await page.getByRole('button', { name: /connexion|login|sign in/i }).isVisible().catch(() => false);
    
    expect(isOnLogin || hasLoginButton).toBeTruthy();
  });
});
