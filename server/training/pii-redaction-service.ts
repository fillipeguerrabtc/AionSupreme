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
  // Regex patterns for PII detection
  private readonly EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  
  // Phone patterns (US, BR, international)
  private readonly PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?([0-9]{2,3})\)?[-.\s]?([0-9]{3,4})[-.\s]?([0-9]{4})|(?:\+55[-.\s]?)?\(?([0-9]{2})\)?[-.\s]?([0-9]{4,5})[-.\s]?([0-9]{4})/g;
  
  // SSN (US: 123-45-6789)
  private readonly SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
  
  // CPF (BR: 123.456.789-01)
  private readonly CPF_REGEX = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
  
  // Credit card (basic pattern, validated with Luhn)
  private readonly CREDIT_CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
  
  // Common name prefixes (basic NER - pode ser melhorado com library real)
  private readonly NAME_PREFIXES = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Sr.', 'Sra.', 'Dra.'];
  
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
    
    // 3. Redact SSN
    if (config.piiRedaction.redactSSN) {
      redactedText = this.redactSSN(redactedText, redactions);
    }
    
    // 4. Redact credit cards
    if (config.piiRedaction.redactCreditCards) {
      redactedText = this.redactCreditCards(redactedText, redactions);
    }
    
    // 5. Redact names (basic)
    if (config.piiRedaction.redactNames) {
      redactedText = this.redactNames(redactedText, redactions);
    }
    
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
   * Redact names (basic NER - pode ser melhorado)
   * 
   * NOTE: Este é um NER básico. Para production real com healthcare/finance,
   * considere usar biblioteca dedicada como:
   * - spaCy (Python NER)
   * - Comprehend Medical (AWS)
   * - Cloud Natural Language (Google)
   */
  private redactNames(text: string, redactions: RedactionResult['redactions']): string {
    let result = text;
    
    // Pattern 1: Prefixo + Nome (e.g., "Dr. Silva")
    for (const prefix of this.NAME_PREFIXES) {
      const pattern = new RegExp(`${prefix}\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)`, 'g');
      result = result.replace(pattern, (match, offset) => {
        const replacement = `${prefix} [NAME_REDACTED]`;
        redactions.push({
          type: 'name',
          original: match,
          replacement,
          position: offset,
        });
        return replacement;
      });
    }
    
    // Pattern 2: Nome completo com maiúsculas (e.g., "João Silva Santos")
    // Heurística: 2-3 palavras consecutivas com primeira letra maiúscula
    const namePattern = /\b([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
    result = result.replace(namePattern, (match, offset) => {
      // Verificar se não é começo de frase (evitar falsos positivos)
      const charBefore = result[offset - 1];
      if (charBefore && charBefore !== '.' && charBefore !== '!' && charBefore !== '?') {
        const replacement = '[NAME_REDACTED]';
        redactions.push({
          type: 'name',
          original: match,
          replacement,
          position: offset,
        });
        return replacement;
      }
      return match;
    });
    
    return result;
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
