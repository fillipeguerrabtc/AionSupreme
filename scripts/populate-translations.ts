/**
 * MANUAL TRANSLATION POPULATION
 * ==============================
 * 
 * Manually translates the 66 GoogleAuthDialog strings from PT → EN/ES
 * Using my linguistic knowledge (fluent PT/EN/ES)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const translations: Record<string, { enUS: string; esES: string }> = {
  // Dialog
  "dialog.trigger": { enUS: "Connect Google Account", esES: "Conectar Cuenta Google" },
  "dialog.title": { enUS: "Google Authentication - Kaggle & Colab", esES: "Autenticación Google - Kaggle & Colab" },
  "dialog.description": { enUS: "Configure secure access to GPU platforms with AES-256-GCM encryption", esES: "Configure acceso seguro a plataformas de GPU con cifrado AES-256-GCM" },
  
  // Tabs
  "tabs.instructions": { enUS: "1. Instructions", esES: "1. Instrucciones" },
  "tabs.kaggle": { enUS: "2. Kaggle", esES: "2. Kaggle" },
  "tabs.colab": { enUS: "3. Colab", esES: "3. Colab" },
  
  // Instructions - How it Works
  "instructions.howItWorks.title": { enUS: "How it works", esES: "Cómo funciona" },
  "instructions.howItWorks.description": { enUS: "You'll log in manually ONCE to Google. Then, we'll copy the authentication cookies and save them encrypted. The system will automatically scrape quotas every 10 minutes, without needing to log in again for ~30 days.", esES: "Iniciarás sesión manualmente UNA VEZ en Google. Luego, copiaremos las cookies de autenticación y las guardaremos cifradas. El sistema hará scraping automático de las cuotas cada 10 minutos, sin necesidad de iniciar sesión nuevamente por ~30 días." },
  
  // Instructions - Prerequisites
  "instructions.prerequisites.title": { enUS: "Prerequisites", esES: "Prerrequisitos" },
  "instructions.prerequisites.chrome": { enUS: "Google Chrome browser (recommended for compatibility)", esES: "Navegador Google Chrome (recomendado para compatibilidad)" },
  "instructions.prerequisites.account": { enUS: "Google account with access to Kaggle and/or Google Colab", esES: "Cuenta Google con acceso a Kaggle y/o Google Colab" },
  "instructions.prerequisites.devtools": { enUS: "DevTools open (F12) to copy cookies", esES: "DevTools abierto (F12) para copiar cookies" },
  
  // Instructions - Security
  "instructions.security.title": { enUS: "Security", esES: "Seguridad" },
  "instructions.security.encryption": { enUS: "Cookies encrypted with AES-256-GCM using SESSION_SECRET", esES: "Cookies cifradas con AES-256-GCM usando SESSION_SECRET" },
  "instructions.security.noPlaintext": { enUS: "No cookies stored in plain text", esES: "Ninguna cookie almacenada en texto plano" },
  "instructions.security.autoValidation": { enUS: "Automatic validation on every sync (10min)", esES: "Validación automática en cada sync (10min)" },
  "instructions.security.expiration": { enUS: "Expiration after 30 days (with advance warnings)", esES: "Expiración después de 30 días (con avisos anticipados)" },
  
  // Instructions - Warning
  "instructions.warning.title": { enUS: "⚠️ IMPORTANT - BAN Risk", esES: "⚠️ IMPORTANTE - Riesgo de BAN" },
  "instructions.warning.kaggle": { enUS: "<strong>Kaggle:</strong> Max 8.4h/session, 21h/week. Violation = PERMANENT BAN.", esES: "<strong>Kaggle:</strong> Máx 8.4h/sesión, 21h/semana. Violación = BAN PERMANENTE." },
  "instructions.warning.colab": { enUS: "<strong>Colab:</strong> Max 8.4h/session, 36h cooldown. Violation = PERMANENT BAN.", esES: "<strong>Colab:</strong> Máx 8.4h/sesión, 36h cooldown. Violación = BAN PERMANENTE." },
  "instructions.warning.auto": { enUS: "The system automatically respects these limits via quota scraping.", esES: "El sistema respeta automáticamente estos límites vía scraping de cuotas." },
  
  // Instructions - Buttons
  "instructions.buttons.kaggle": { enUS: "Connect Kaggle", esES: "Conectar Kaggle" },
  "instructions.buttons.colab": { enUS: "Connect Colab", esES: "Conectar Colab" },
  
  // Kaggle Tab
  "kaggle.title": { enUS: "Step by step - Kaggle", esES: "Paso a paso - Kaggle" },
  "kaggle.step1": { enUS: "Open www.kaggle.com in new tab", esES: "Abre www.kaggle.com en nueva pestaña" },
  "kaggle.step2": { enUS: "Log in with your Google account", esES: "Inicia sesión con tu cuenta Google" },
  "kaggle.step3": { enUS: "Open DevTools (F12) → Console → Paste the command below", esES: "Abre DevTools (F12) → Consola → Pega el comando abajo" },
  "kaggle.step4": { enUS: "Copy the result and paste in the \"Cookies\" field below", esES: "Copia el resultado y pega en el campo \"Cookies\" abajo" },
  "kaggle.cookieCommand.label": { enUS: "Command to copy cookies (Paste in DevTools Console):", esES: "Comando para copiar cookies (Pega en Consola DevTools):" },
  "kaggle.email.label": { enUS: "Google account email", esES: "Email de cuenta Google" },
  "kaggle.email.placeholder": { enUS: "your-email@gmail.com", esES: "tu-email@gmail.com" },
  "kaggle.cookies.label": { enUS: "Cookies (Paste the Console result)", esES: "Cookies (Pega el resultado de la Consola)" },
  "kaggle.cookies.placeholder": { enUS: "KAGGLE_KEY=value; KAGGLE_USER_ID=123; ...", esES: "KAGGLE_KEY=value; KAGGLE_USER_ID=123; ..." },
  "kaggle.cookies.hint": { enUS: "Expected format: name1=value1; name2=value2; ...", esES: "Formato esperado: name1=value1; name2=value2; ..." },
  "kaggle.buttons.back": { enUS: "Back", esES: "Volver" },
  "kaggle.buttons.save": { enUS: "Save Kaggle", esES: "Guardar Kaggle" },
  "kaggle.buttons.saving": { enUS: "Saving...", esES: "Guardando..." },
  
  // Colab Tab
  "colab.title": { enUS: "Step by step - Google Colab", esES: "Paso a paso - Google Colab" },
  "colab.step1": { enUS: "Open colab.research.google.com in new tab", esES: "Abre colab.research.google.com en nueva pestaña" },
  "colab.step2": { enUS: "Log in with your Google account", esES: "Inicia sesión con tu cuenta Google" },
  "colab.step3": { enUS: "Open DevTools (F12) → Console → Paste the command below", esES: "Abre DevTools (F12) → Consola → Pega el comando abajo" },
  "colab.step4": { enUS: "Copy the result and paste in the \"Cookies\" field below", esES: "Copia el resultado y pega en el campo \"Cookies\" abajo" },
  "colab.cookieCommand.label": { enUS: "Command to copy cookies (Paste in DevTools Console):", esES: "Comando para copiar cookies (Pega en Consola DevTools):" },
  "colab.email.label": { enUS: "Google account email", esES: "Email de cuenta Google" },
  "colab.email.placeholder": { enUS: "your-email@gmail.com", esES: "tu-email@gmail.com" },
  "colab.cookies.label": { enUS: "Cookies (Paste the Console result)", esES: "Cookies (Pega el resultado de la Consola)" },
  "colab.cookies.placeholder": { enUS: "GOOGLE_SESSION=value; GOOGLE_USER=123; ...", esES: "GOOGLE_SESSION=value; GOOGLE_USER=123; ..." },
  "colab.cookies.hint": { enUS: "Expected format: name1=value1; name2=value2; ...", esES: "Formato esperado: name1=value1; name2=value2; ..." },
  "colab.buttons.back": { enUS: "Back", esES: "Volver" },
  "colab.buttons.save": { enUS: "Save Colab", esES: "Guardar Colab" },
  "colab.buttons.saving": { enUS: "Saving...", esES: "Guardando..." },
  
  // Toasts
  "toasts.saveSuccess.title": { enUS: "✅ Authentication saved", esES: "✅ Autenticación guardada" },
  "toasts.saveSuccess.descriptionTemplate": { enUS: "{{provider}} cookies successfully saved for {{email}}", esES: "Cookies de {{provider}} guardadas exitosamente para {{email}}" },
  "toasts.saveError.title": { enUS: "❌ Error saving authentication", esES: "❌ Error al guardar autenticación" },
  "toasts.copied.title": { enUS: "✅ Copied!", esES: "✅ Copiado!" },
  "toasts.copied.description": { enUS: "Command copied to clipboard", esES: "Comando copiado al portapapeles" },
  
  // Errors
  "errors.emailRequired.title": { enUS: "Email required", esES: "Email obligatorio" },
  "errors.emailRequired.description": { enUS: "Please enter your Google account email", esES: "Por favor ingresa el email de tu cuenta Google" },
  "errors.cookiesRequired.title": { enUS: "Cookies required", esES: "Cookies obligatorias" },
  "errors.cookiesRequired.description": { enUS: "Please paste the cookies copied from the browser", esES: "Por favor pega las cookies copiadas del navegador" },
  "errors.cookiesInvalid.title": { enUS: "Invalid cookies", esES: "Cookies inválidas" },
  "errors.cookiesInvalid.description": { enUS: "Could not extract valid cookies from pasted text", esES: "No se pudieron extraer cookies válidas del texto pegado" },
  "errors.processingError.title": { enUS: "Error processing cookies", esES: "Error al procesar cookies" },
  "errors.processingError.fallback": { enUS: "Invalid format", esES: "Formato inválido" },
  
  // Providers
  "providers.kaggle": { enUS: "Kaggle", esES: "Kaggle" },
  "providers.colab": { enUS: "Colab", esES: "Colab" },
};

// Read original JSON
const jsonPath = path.join(__dirname, 'googleAuthDialog-i18n.json');
const entries: any[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

// Populate translations
let populated = 0;
for (const entry of entries) {
  if (translations[entry.key]) {
    entry.enUS = translations[entry.key].enUS;
    entry.esES = translations[entry.key].esES;
    populated++;
  }
}

// Save updated JSON
fs.writeFileSync(jsonPath, JSON.stringify(entries, null, 2), 'utf-8');

console.log(`✅ Populated ${populated}/${entries.length} translations`);
console.log('\n📋 NEXT STEP: Run generator again:');
console.log('npx tsx scripts/generate-i18n-google-auth.ts > scripts/i18n-google-auth-output.txt');
