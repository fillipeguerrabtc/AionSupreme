import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Language = "pt-BR" | "en-US" | "es-ES";

interface Translations {
  chat: {
    welcome: string;
    welcomeDesc: string;
    placeholder: string;
    thinking: string;
    send: string;
    title: string;
    subtitle: string;
  };
  admin: {
    title: string;
    subtitle: string;
    backToChat: string;
    policies: string;
    policiesDesc: string;
    behavior: string;
    behaviorDesc: string;
    formality: string;
    creativity: string;
    systemPrompt: string;
    systemPromptDesc: string;
    systemPromptPlaceholder: string;
    knowledgeBase: string;
    knowledgeBaseDesc: string;
    indexPDFs: string;
    indexing: string;
    policyUpdated: string;
    pdfsIndexed: string;
    loading: string;
    error: string;
    rules: {
      self_harm: string;
      hate_speech: string;
      illicit_howto: string;
      mild_profanity: string;
      minor_violence: string;
      explicit_sexual: string;
      political_extremism: string;
    };
  };
}

const translations: Record<Language, Translations> = {
  "pt-BR": {
    chat: {
      welcome: "Bem-vindo ao AION",
      welcomeDesc: "Sistema de IA autônomo com capacidades ilimitadas. Pergunte qualquer coisa.",
      placeholder: "Digite sua mensagem...",
      thinking: "Pensando...",
      send: "Enviar",
      title: "AION",
      subtitle: "IA Suprema & Ilimitada",
    },
    admin: {
      title: "AION Admin",
      subtitle: "Painel de Controle & Políticas",
      backToChat: "Voltar ao Chat",
      policies: "Políticas Moral/Ética/Legal",
      policiesDesc: "Configure restrições de conteúdo (sistema nasce 100% livre)",
      behavior: "Comportamento da IA",
      behaviorDesc: "Ajuste a personalidade e estilo de resposta",
      formality: "Formalidade",
      creativity: "Criatividade",
      systemPrompt: "System Prompt",
      systemPromptDesc: "Instruções base para o comportamento da IA",
      systemPromptPlaceholder: "Digite o system prompt...",
      knowledgeBase: "Knowledge Base",
      knowledgeBaseDesc: "Indexe os 7 PDFs técnicos para RAG",
      indexPDFs: "Indexar PDFs Técnicos",
      indexing: "Indexando...",
      policyUpdated: "Política atualizada com sucesso!",
      pdfsIndexed: "PDFs indexados com sucesso!",
      loading: "Carregando painel administrativo...",
      error: "Erro ao carregar políticas",
      rules: {
        self_harm: "Auto-Lesão",
        hate_speech: "Discurso de Ódio",
        illicit_howto: "Atividades Ilícitas",
        mild_profanity: "Linguagem Imprópria",
        minor_violence: "Violência Menor",
        explicit_sexual: "Conteúdo Sexual Explícito",
        political_extremism: "Extremismo Político",
      },
    },
  },
  "en-US": {
    chat: {
      welcome: "Welcome to AION",
      welcomeDesc: "Autonomous AI system with unlimited capabilities. Ask anything.",
      placeholder: "Type your message...",
      thinking: "Thinking...",
      send: "Send",
      title: "AION",
      subtitle: "Supreme & Unlimited AI",
    },
    admin: {
      title: "AION Admin",
      subtitle: "Control Panel & Policies",
      backToChat: "Back to Chat",
      policies: "Moral/Ethical/Legal Policies",
      policiesDesc: "Configure content restrictions (system born 100% free)",
      behavior: "AI Behavior",
      behaviorDesc: "Adjust personality and response style",
      formality: "Formality",
      creativity: "Creativity",
      systemPrompt: "System Prompt",
      systemPromptDesc: "Base instructions for AI behavior",
      systemPromptPlaceholder: "Enter system prompt...",
      knowledgeBase: "Knowledge Base",
      knowledgeBaseDesc: "Index the 7 technical PDFs for RAG",
      indexPDFs: "Index Technical PDFs",
      indexing: "Indexing...",
      policyUpdated: "Policy updated successfully!",
      pdfsIndexed: "PDFs indexed successfully!",
      loading: "Loading admin panel...",
      error: "Error loading policies",
      rules: {
        self_harm: "Self-Harm",
        hate_speech: "Hate Speech",
        illicit_howto: "Illicit Activities",
        mild_profanity: "Inappropriate Language",
        minor_violence: "Minor Violence",
        explicit_sexual: "Explicit Sexual Content",
        political_extremism: "Political Extremism",
      },
    },
  },
  "es-ES": {
    chat: {
      welcome: "Bienvenido a AION",
      welcomeDesc: "Sistema de IA autónomo con capacidades ilimitadas. Pregunta cualquier cosa.",
      placeholder: "Escribe tu mensaje...",
      thinking: "Pensando...",
      send: "Enviar",
      title: "AION",
      subtitle: "IA Suprema e Ilimitada",
    },
    admin: {
      title: "AION Admin",
      subtitle: "Panel de Control y Políticas",
      backToChat: "Volver al Chat",
      policies: "Políticas Moral/Ética/Legal",
      policiesDesc: "Configura restricciones de contenido (sistema nace 100% libre)",
      behavior: "Comportamiento de la IA",
      behaviorDesc: "Ajusta la personalidad y estilo de respuesta",
      formality: "Formalidad",
      creativity: "Creatividad",
      systemPrompt: "System Prompt",
      systemPromptDesc: "Instrucciones base para el comportamiento de la IA",
      systemPromptPlaceholder: "Introduce el system prompt...",
      knowledgeBase: "Base de Conocimiento",
      knowledgeBaseDesc: "Indexa los 7 PDFs técnicos para RAG",
      indexPDFs: "Indexar PDFs Técnicos",
      indexing: "Indexando...",
      policyUpdated: "¡Política actualizada con éxito!",
      pdfsIndexed: "¡PDFs indexados con éxito!",
      loading: "Cargando panel administrativo...",
      error: "Error al cargar políticas",
      rules: {
        self_harm: "Autolesión",
        hate_speech: "Discurso de Odio",
        illicit_howto: "Actividades Ilícitas",
        mild_profanity: "Lenguaje Inapropiado",
        minor_violence: "Violencia Menor",
        explicit_sexual: "Contenido Sexual Explícito",
        political_extremism: "Extremismo Político",
      },
    },
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function detectBrowserLanguage(): Language {
  const browserLang = navigator.language || navigator.languages?.[0] || "en-US";
  
  if (browserLang.startsWith("pt")) return "pt-BR";
  if (browserLang.startsWith("es")) return "es-ES";
  return "en-US";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("aion-language");
    if (saved && (saved === "pt-BR" || saved === "en-US" || saved === "es-ES")) {
      return saved as Language;
    }
    return detectBrowserLanguage();
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("aion-language", lang);
  };

  const value = {
    language,
    setLanguage,
    t: translations[language],
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
