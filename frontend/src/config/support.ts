/**
 * Support Configuration
 * =====================
 * Change the Telegram link here whenever your support Telegram account changes.
 * You can also override it using the NEXT_PUBLIC_SUPPORT_TELEGRAM environment variable.
 */

export const SUPPORT_CONFIG = {
  // Replace this placeholder link with your actual Telegram username or link
  // e.g., 'https://t.me/your_support_username'
  telegramUrl:
    process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM ||
    'https://t.me/your_support_account',

  telegramHandle: '@Support',
  supportEmail: 'support@example.com',
  workingHours: '24/7 Dedicated Support',
};
