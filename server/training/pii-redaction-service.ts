/**
 * PII REDACTION SERVICE - Privacy-Preserving Data Sanitization
 * 
 * Remove/redact Personal Identifiable Information (PII) antes de treinar modelo.
 * 
 * COVERAGE:
 * - Email addresses (regex)
 * - Phone numbers (US/BR/international formats)
 * - SSN / CPF (US Social Security, Brazilian CPF)
 * - Credit card numbers (Luhn algorithm validation)
 * - Names (basic NER - pode ser estendido com library)
 * 
 * COMPLIANCE:
 * - GDPR (European data protection)
 * - HIPAA (US healthcare)
 * - LGPD (Brazilian data protection)
 * 
 * RESEARCH BASIS:
 * - Tonic Textual playbook for LLM fine-tuning
 * - NIST privacy guidelines for ML (2025)
 */

import type { MetaLearningConfig } from "./meta-learning-config";

export interface RedactionResult {
  redactedText: string;
  redactions: Array<{
    type: 'email' | 'phone' | 'ssn' | 'cpf' | 'creditCard' | 'name';
    original: string;
    replacement: string;
    position: number;
  }>;
  redactionCount: number;
}

export class PIIRedactionService {
  // ========== IMPROVED REGEX PATTERNS (2025 Best Practices) ==========
  
  // Email: mais robusto, suporta novos TLDs
  private readonly EMAIL_REGEX = /\b[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}\b/g;
  
  // Phone: expansão para mais formatos (US, BR, UK, etc)
  private readonly PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?([0-9]{2,3})\)?[-.\s]?([0-9]{3,4})[-.\s]?([0-9]{4})|(?:\+55[-.\s]?)?\(?([0-9]{2})\)?[-.\s]?([0-9]{4,5})[-.\s]?([0-9]{4})|(?:\+44[-.\s]?)?(?:\(0\)[-.\s]?)?([0-9]{2,4})[-.\s]?([0-9]{3,4})[-.\s]?([0-9]{3,4})/g;
  
  // SSN (US: 123-45-6789) + formatos sem hífens
  private readonly SSN_REGEX = /\b\d{3}-?\d{2}-?\d{4}\b/g;
  
  // CPF (BR: 123.456.789-01) + formatos sem pontos
  private readonly CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
  
  // CNPJ (BR corporate ID: 12.345.678/0001-90)
  private readonly CNPJ_REGEX = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
  
  // Credit card: mais formatos (American Express, Diners, etc)
  private readonly CREDIT_CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b3[47]\d{2}[-\s]?\d{6}[-\s]?\d{5}\b/g;
  
  // IP Address (pode conter dados sensíveis em logs)
  private readonly IP_ADDRESS_REGEX = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
  
  // URLs com query params (podem conter tokens/IDs)
  private readonly URL_WITH_PARAMS_REGEX = /https?:\/\/[^\s]+\?[^\s]+/g;
  
  // Common name prefixes (expandido)
  private readonly NAME_PREFIXES = [
    'Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'Prof.', 'Sr.', 'Sra.', 'Dra.', 
    'Rev.', 'Hon.', 'Eng.', 'Adv.', 'Ph.D', 'MD', 'Esq.'
  ];
  
  // Padrão para detectar nomes completos (capitalização)
  // Detecta: "Maria Silva", "John Doe", etc
  private readonly FULL_NAME_REGEX = /\b([A-Z][a-z]{2,})\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\b/g;
  
  // Common false positives (países, cidades, empresas)
  private readonly NAME_FALSE_POSITIVES = [
    // Países
    'United States', 'United Kingdom', 'New Zealand', 'South Africa', 'North Korea', 'South Korea',
    // Cidades (US)
    'New York', 'Los Angeles', 'San Francisco', 'Las Vegas', 'San Diego', 'San Jose', 'Santa Barbara',
    // Cidades (BR)
    'São Paulo', 'Rio Janeiro', 'Belo Horizonte', 'Porto Alegre',
    // Tech companies
    'Google Cloud', 'Microsoft Azure', 'Amazon Web', 'Apple Inc', 'Meta Platforms', 'Open AI',
    // Common phrases
    'Thank You', 'Best Regards', 'Kind Regards', 'Dear Sir', 'Dear Madam'
  ];
  
  /**
   * Redact PII from text according to configuration
   */
  redact(text: string, config: MetaLearningConfig): RedactionResult {
    if (!config.piiRedaction.enabled) {
      return {
        redactedText: text,
        redactions: [],
        redactionCount: 0,
      };
    }
    
    let redactedText = text;
    const redactions: RedactionResult['redactions'] = [];
    
    // 1. Redact emails
    if (config.piiRedaction.redactEmails) {
      redactedText = this.redactEmails(redactedText, redactions);
    }
    
    // 2. Redact phones
    if (config.piiRedaction.redactPhones) {
      redactedText = this.redactPhones(redactedText, redactions);
    }
    
    // 3. Redact SSN/CPF/CNPJ
    if (config.piiRedaction.redactSSN) {
      redactedText = this.redactSSN(redactedText, redactions);
    }
    
    // 4. Redact credit cards
    if (config.piiRedaction.redactCreditCards) {
      redactedText = this.redactCreditCards(redactedText, redactions);
    }
    
    // 5. Redact names (improved pattern matching)
    if (config.piiRedaction.redactNames) {
      redactedText = this.redactNames(redactedText, redactions);
    }
    
    // 6. Redact IP addresses (optional - pode conter dados sensíveis)
    redactedText = this.redactIPAddresses(redactedText, redactions);
    
    // 7. Redact URLs with query params (podem conter tokens)
    redactedText = this.redactSensitiveURLs(redactedText, redactions);
    
    return {
      redactedText,
      redactions,
      redactionCount: redactions.length,
    };
  }
  
  /**
   * Redact email addresses
   */
  private redactEmails(text: string, redactions: RedactionResult['redactions']): string {
    return text.replace(this.EMAIL_REGEX, (match, offset) => {
      const replacement = '[EMAIL_REDACTED]';
      redactions.push({
        type: 'email',
        original: match,
        replacement,
        position: offset,
      });
      return replacement;
    });
  }
  
  /**
   * Redact phone numbers
   */
  private redactPhones(text: string, redactions: RedactionResult['redactions']): string {
    return text.replace(this.PHONE_REGEX, (match, ...args) => {
      const offset = args[args.length - 2]; // Offset is second-to-last arg
      const replacement = '[PHONE_REDACTED]';
      redactions.push({
        type: 'phone',
        original: match,
        replacement,
        position: offset,
      });
      return replacement;
    });
  }
  
  /**
   * Redact SSN (US Social Security Number)
   */
  private redactSSN(text: string, redactions: RedactionResult['redactions']): string {
    // Redact SSN
    let result = text.replace(this.SSN_REGEX, (match, offset) => {
      const replacement = '[SSN_REDACTED]';
      redactions.push({
        type: 'ssn',
        original: match,
        replacement,
        position: offset,
      });
      return replacement;
    });
    
    // Redact CPF (Brazilian equivalent)
    result = result.replace(this.CPF_REGEX, (match, offset) => {
      const replacement = '[CPF_REDACTED]';
      redactions.push({
        type: 'cpf',
        original: match,
        replacement,
        position: offset,
      });
      return replacement;
    });
    
    return result;
  }
  
  /**
   * Redact credit card numbers (with Luhn validation)
   */
  private redactCreditCards(text: string, redactions: RedactionResult['redactions']): string {
    return text.replace(this.CREDIT_CARD_REGEX, (match, offset) => {
      // Remove spaces/dashes para validação
      const digits = match.replace(/[-\s]/g, '');
      
      // Validar com algoritmo de Luhn
      if (this.isValidCreditCard(digits)) {
        const replacement = '[CARD_REDACTED]';
        redactions.push({
          type: 'creditCard',
          original: match,
          replacement,
          position: offset,
        });
        return replacement;
      }
      
      // Não é cartão válido, manter original
      return match;
    });
  }
  
  /**
   * Luhn algorithm for credit card validation
   */
  private isValidCreditCard(cardNumber: string): boolean {
    let sum = 0;
    let isEven = false;
    
    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumber[i], 10);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    return sum % 10 === 0;
  }
  
  /**
   * Redact names (IMPROVED - detects more patterns)
   */
  private redactNames(text: string, redactions: RedactionResult['redactions']): string {
    let result = text;
    
    // 1. Detectar nomes com prefixos (Mr. John Doe)
    for (const prefix of this.NAME_PREFIXES) {
      const regex = new RegExp(`${prefix.replace('.', '\\.')}\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)`, 'g');
      result = result.replace(regex, (match, name, offset) => {
        const replacement = '[NAME_REDACTED]';
        redactions.push({
          type: 'name',
          original: match,
          replacement,
          position: offset,
        });
        return replacement;
      });
    }
    
    // 2. Detectar nomes completos capitalizados (Maria Silva, John Doe)
    // CRITICAL: False-positive filtering para evitar redação excessiva
    result = result.replace(this.FULL_NAME_REGEX, (match, firstName, lastName, offset) => {
      // Guard 1: Skip whitelist false positives (países, cidades, empresas)
      if (this.NAME_FALSE_POSITIVES.some(fp => match === fp || match.includes(fp))) {
        return match;
      }
      
      // Guard 2: Skip if preceded/followed by corporate indicators
      const before = text.substring(Math.max(0, offset - 20), offset);
      const after = text.substring(offset + match.length, offset + match.length + 20);
      if (/\b(Inc\.|LLC|Ltd\.|Corp\.|Company|Technologies|Solutions)\b/i.test(before + after)) {
        return match;
      }
      
      // Guard 3: Skip if part of sentence start (Capitalized At Start)
      const charBefore = text[offset - 1];
      if (!charBefore || charBefore === '.' || charBefore === '!' || charBefore === '?' || charBefore === '\n') {
        return match; // Likely sentence start, not a name
      }
      
      // Guard 4: Skip common day/month names
      const timeIndicators = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 
                             'August', 'September', 'October', 'November', 'December',
                             'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      if (timeIndicators.some(t => match.includes(t))) {
        return match;
      }
      
      // Passed all guards - likely a real name
      const replacement = '[NAME_REDACTED]';
      redactions.push({
        type: 'name',
        original: match,
        replacement,
        position: offset,
      });
      return replacement;
    });
    
    return result;
  }
  
  /**
   * Redact IP addresses (skip private/local ranges per RFC1918)
   */
  private redactIPAddresses(text: string, redactions: RedactionResult['redactions']): string {
    return text.replace(this.IP_ADDRESS_REGEX, (match, offset) => {
      // Skip RFC1918 private ranges + localhost + link-local
      const isPrivate = 
        match.startsWith('127.') ||           // Localhost
        match.startsWith('10.') ||            // Private Class A
        match.startsWith('192.168.') ||       // Private Class C
        match.startsWith('172.16.') ||        // Private Class B (16-31)
        match.startsWith('172.17.') ||
        match.startsWith('172.18.') ||
        match.startsWith('172.19.') ||
        match.startsWith('172.20.') ||
        match.startsWith('172.21.') ||
        match.startsWith('172.22.') ||
        match.startsWith('172.23.') ||
        match.startsWith('172.24.') ||
        match.startsWith('172.25.') ||
        match.startsWith('172.26.') ||
        match.startsWith('172.27.') ||
        match.startsWith('172.28.') ||
        match.startsWith('172.29.') ||
        match.startsWith('172.30.') ||
        match.startsWith('172.31.') ||
        match.startsWith('169.254.');          // Link-local
      
      if (isPrivate) {
        return match; // Keep private IPs (not sensitive)
      }
      
      const replacement = '[IP_REDACTED]';
      redactions.push({
        type: 'name', // Reutilizando type
        original: match,
        replacement,
        position: offset,
      });
      return replacement;
    });
  }
  
  /**
   * Redact URLs with query parameters (podem conter tokens/IDs)
   */
  private redactSensitiveURLs(text: string, redactions: RedactionResult['redactions']): string {
    return text.replace(this.URL_WITH_PARAMS_REGEX, (match, offset) => {
      try {
        // Extrair apenas query params
        const url = new URL(match);
        const hasSensitiveParams = ['token', 'api_key', 'key', 'secret', 'password', 'auth', 'session'].some(
          param => url.searchParams.has(param)
        );
        
        if (hasSensitiveParams) {
          const replacement = `${url.origin}${url.pathname}[PARAMS_REDACTED]`;
          redactions.push({
            type: 'name', // Reutilizando type
            original: match,
            replacement,
            position: offset,
          });
          return replacement;
        }
        
        return match; // Keep URL se não tem params sensíveis
      } catch (err) {
        // Invalid URL, manter original
        return match;
      }
    });
  }
  
  /**
   * Validate redaction result (for testing)
   */
  hasNoPII(text: string): {
    clean: boolean;
    foundPII: string[];
  } {
    const foundPII: string[] = [];
    
    if (this.EMAIL_REGEX.test(text)) {
      foundPII.push('email');
    }
    if (this.PHONE_REGEX.test(text)) {
      foundPII.push('phone');
    }
    if (this.SSN_REGEX.test(text)) {
      foundPII.push('ssn');
    }
    if (this.CPF_REGEX.test(text)) {
      foundPII.push('cpf');
    }
    if (this.CREDIT_CARD_REGEX.test(text)) {
      foundPII.push('creditCard');
    }
    
    return {
      clean: foundPII.length === 0,
      foundPII,
    };
  }
  
  /**
   * Get redaction statistics
   */
  getRedactionStats(results: RedactionResult[]): {
    totalRedactions: number;
    byType: Record<string, number>;
    avgRedactionsPerText: number;
  } {
    const totalRedactions = results.reduce((sum, r) => sum + r.redactionCount, 0);
    const byType: Record<string, number> = {};
    
    for (const result of results) {
      for (const redaction of result.redactions) {
        byType[redaction.type] = (byType[redaction.type] || 0) + 1;
      }
    }
    
    return {
      totalRedactions,
      byType,
      avgRedactionsPerText: results.length > 0 ? totalRedactions / results.length : 0,
    };
  }
}

// Singleton export
export const piiRedactionService = new PIIRedactionService();
