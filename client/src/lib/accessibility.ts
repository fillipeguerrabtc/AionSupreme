/**
 * Accessibility Utilities for WCAG 2.1 AA Compliance
 * Provides focus management, ARIA label generation, and keyboard navigation helpers
 */

/**
 * Focus Management
 */

export function trapFocus(element: HTMLElement) {
  const focusableElements = element.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  const handleTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        lastElement.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastElement) {
        firstElement.focus();
        e.preventDefault();
      }
    }
  };

  element.addEventListener('keydown', handleTabKey);

  return () => {
    element.removeEventListener('keydown', handleTabKey);
  };
}

export function focusFirst(element: HTMLElement) {
  const focusableElements = element.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusableElements.length > 0) {
    focusableElements[0].focus();
  }
}

export function setFocusableGroup(elements: HTMLElement[], active: boolean) {
  elements.forEach((element) => {
    element.setAttribute('tabindex', active ? '0' : '-1');
  });
}

/**
 * ARIA Label Generators
 */

export function generateAriaLabel(action: string, target: string): string {
  return `${action} ${target}`;
}

export function generateAriaLabelForButton(action: string, item?: string): string {
  return item ? `${action} ${item}` : action;
}

export function generateLoadingAriaLabel(action: string): string {
  return `${action} em andamento`;
}

/**
 * Keyboard Navigation
 */

export function handleArrowNavigation(
  event: KeyboardEvent,
  elements: HTMLElement[],
  currentIndex: number
): number {
  let newIndex = currentIndex;

  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowRight':
      event.preventDefault();
      newIndex = (currentIndex + 1) % elements.length;
      break;
    case 'ArrowUp':
    case 'ArrowLeft':
      event.preventDefault();
      newIndex = currentIndex === 0 ? elements.length - 1 : currentIndex - 1;
      break;
    case 'Home':
      event.preventDefault();
      newIndex = 0;
      break;
    case 'End':
      event.preventDefault();
      newIndex = elements.length - 1;
      break;
  }

  if (newIndex !== currentIndex) {
    elements[newIndex]?.focus();
  }

  return newIndex;
}

export function handleEscapeKey(callback: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      callback();
    }
  };
}

/**
 * Screen Reader Announcements
 */

export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * Semantic HTML Helpers
 */

export function getLandmarkRole(section: 'header' | 'nav' | 'main' | 'aside' | 'footer'): string {
  const roleMap = {
    header: 'banner',
    nav: 'navigation',
    main: 'main',
    aside: 'complementary',
    footer: 'contentinfo',
  };
  return roleMap[section];
}

/**
 * Color Contrast Utilities
 */

export function meetsContrastRatio(
  foreground: string,
  background: string,
  level: 'AA' | 'AAA' = 'AA'
): boolean {
  // Simplified check - in production, use a proper contrast calculation library
  const requiredRatio = level === 'AA' ? 4.5 : 7;
  // This is a placeholder - implement actual contrast calculation
  return true;
}

/**
 * Form Validation Announcements
 */

export function announceFormError(fieldName: string, error: string) {
  announceToScreenReader(`Erro no campo ${fieldName}: ${error}`, 'assertive');
}

export function announceFormSuccess(message: string) {
  announceToScreenReader(message, 'polite');
}

/**
 * Loading State Helpers
 */

export function setAriaLoading(element: HTMLElement, loading: boolean) {
  if (loading) {
    element.setAttribute('aria-busy', 'true');
  } else {
    element.removeAttribute('aria-busy');
  }
}

/**
 * Custom Hook for Focus Trap (React)
 */

export function useFocusTrap(ref: React.RefObject<HTMLElement>, enabled: boolean = true) {
  if (typeof window === 'undefined') return;

  const { useEffect } = require('react');

  useEffect(() => {
    if (!enabled || !ref.current) return;

    const cleanup = trapFocus(ref.current);
    focusFirst(ref.current);

    return cleanup;
  }, [enabled, ref]);
}

/**
 * Skip Links Helper
 */

export function createSkipLink(targetId: string, label: string = 'Skip to main content') {
  return {
    href: `#${targetId}`,
    'aria-label': label,
    className: 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground',
  };
}
