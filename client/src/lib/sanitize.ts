import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitiza HTML para prevenir ataques XSS.
 * Usa DOMPurify com configuração segura para renderização em componentes React.
 * 
 * @param html - HTML string para sanitizar
 * @returns HTML sanitizado e seguro
 */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    // Permite apenas tags HTML seguras
    ALLOWED_TAGS: [
      'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 
      'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'code', 'pre', 'blockquote'
    ],
    // Permite apenas atributos seguros
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class'],
    // Remove scripts e eventos
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
  });
}
