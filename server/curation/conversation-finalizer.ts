/**
 * Conversation Finalizer - Consolidates chat conversations for HITL curation
 * 
 * Instead of sending each message individually to the curation queue,
 * this service waits for conversation completion and submits the entire
 * conversation as a single consolidated item with full transcript and attachments.
 */

import { db } from "../db";
import { conversations, messages, curationQueue } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { curationStore } from "./store";

export interface ConversationSummary {
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  hasAttachments: boolean;
  totalAttachments: number;
  firstUserMessage: string;
}

export class ConversationFinalizer {
  /**
   * Finalize a conversation and send to curation queue
   * Called when:
   * - User starts a new conversation (explicit)
   * - Conversation inactive for X minutes (timeout)
   * - Conversation is archived
   */
  async finalizeConversation(conversationId: number): Promise<string | null> {
    console.log(`[ConversationFinalizer] Finalizing conversation ${conversationId}...`);

    try {
      // Step 1: Load conversation metadata
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);

      if (!conversation) {
        console.warn(`[ConversationFinalizer] Conversation ${conversationId} not found`);
        return null;
      }

      // Step 2: Load all messages (ordered chronologically)
      const conversationMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.createdAt);

      // Step 3: Check if conversation is substantial enough for curation
      const summary = this.calculateConversationSummary(conversationMessages);

      // Skip if conversation is too short (less than 2 exchanges)
      if (summary.messageCount < 2 || summary.userMessages === 0) {
        console.log(`[ConversationFinalizer] Skipping conversation ${conversationId} - too short (${summary.messageCount} messages)`);
        return null;
      }

      // Step 4: Build message transcript
      const messageTranscript = conversationMessages.map(msg => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
        attachments: msg.attachments || undefined,
        createdAt: msg.createdAt.toISOString(),
      }));

      // Step 5: Aggregate all attachments from all messages
      const allAttachments = conversationMessages
        .flatMap(msg => msg.attachments || [])
        .filter((att): att is NonNullable<typeof att> => att !== null);

      // Step 6: Generate summary content
      const title = summary.firstUserMessage.substring(0, 100) || conversation.title;
      const content = this.generateConversationSummary(summary, conversation.title);

      // Step 7: Submit to curation queue
      const curationItem = await curationStore.addToCuration({
        title,
        content,
        suggestedNamespaces: conversation.namespace ? [conversation.namespace] : ["chat/conversations"],
        tags: ["chat", "conversation", `messages:${summary.messageCount}`],
        submittedBy: "auto-learning",
        conversationId: conversationId,
        messageTranscript: messageTranscript as any, // Type assertion for JSONB
        attachments: allAttachments.length > 0 ? allAttachments as any : undefined,
      });

      console.log(`[ConversationFinalizer] ✅ Conversation ${conversationId} consolidated → Curation item ${curationItem.id}`);
      console.log(`   📊 ${summary.messageCount} messages, ${summary.totalAttachments} attachments`);

      // Step 8: Update conversation's lastActivityAt to mark as finalized
      await db
        .update(conversations)
        .set({ 
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId));

      return curationItem.id;
    } catch (error: any) {
      console.error(`[ConversationFinalizer] ❌ Error finalizing conversation ${conversationId}:`, error.message);
      return null;
    }
  }

  /**
   * Calculate conversation summary statistics
   */
  private calculateConversationSummary(messages: any[]): ConversationSummary {
    let firstUserMessage = "";
    let userMessages = 0;
    let assistantMessages = 0;
    let totalAttachments = 0;

    for (const msg of messages) {
      if (msg.role === "user") {
        userMessages++;
        if (!firstUserMessage && msg.content.trim()) {
          firstUserMessage = msg.content.trim();
        }
      } else if (msg.role === "assistant") {
        assistantMessages++;
      }

      if (msg.attachments && Array.isArray(msg.attachments)) {
        totalAttachments += msg.attachments.length;
      }
    }

    return {
      messageCount: messages.length,
      userMessages,
      assistantMessages,
      hasAttachments: totalAttachments > 0,
      totalAttachments,
      firstUserMessage,
    };
  }

  /**
   * Generate human-readable summary for curation content field
   */
  private generateConversationSummary(summary: ConversationSummary, title: string): string {
    let content = `Conversa consolidada: "${title}"\n\n`;
    content += `📊 Estatísticas:\n`;
    content += `- Total de mensagens: ${summary.messageCount}\n`;
    content += `- Mensagens do usuário: ${summary.userMessages}\n`;
    content += `- Respostas do assistente: ${summary.assistantMessages}\n`;

    if (summary.hasAttachments) {
      content += `- Anexos: ${summary.totalAttachments} (imagens, vídeos, documentos)\n`;
    }

    content += `\n📝 Primeira mensagem: "${summary.firstUserMessage.substring(0, 200)}${summary.firstUserMessage.length > 200 ? '...' : ''}"\n`;
    content += `\n⚠️ Esta é uma conversa consolidada. A transcrição completa está disponível no campo "messageTranscript".`;

    return content;
  }

  /**
   * Find and finalize inactive conversations
   * Called by background job to detect conversations that have been idle
   * 
   * IDEMPOTENCY GUARD: Skips conversations already in curation queue
   */
  async finalizeInactiveConversations(inactivityMinutes: number = 10): Promise<number> {
    console.log(`[ConversationFinalizer] Checking for inactive conversations (>${inactivityMinutes}min idle)...`);

    try {
      const inactivityThreshold = new Date(Date.now() - inactivityMinutes * 60 * 1000);

      // Find conversations that:
      // 1. Have lastActivityAt older than threshold
      // 2. Are not archived
      // 3. Have messages (exclude empty conversations)
      // 4. 🔥 NOT ALREADY IN CURATION QUEUE (idempotency guard)
      const inactiveConversations = await db
        .select({
          id: conversations.id,
          title: conversations.title,
          lastActivityAt: conversations.lastActivityAt,
        })
        .from(conversations)
        .where(
          sql`${conversations.lastActivityAt} < ${inactivityThreshold} 
          AND ${conversations.archivedAt} IS NULL
          AND EXISTS (
            SELECT 1 FROM ${messages} 
            WHERE ${messages.conversationId} = ${conversations.id}
          )
          AND NOT EXISTS (
            SELECT 1 FROM ${curationQueue}
            WHERE ${curationQueue.conversationId} = ${conversations.id}
          )`
        )
        .limit(50); // Process max 50 at a time

      if (inactiveConversations.length === 0) {
        console.log(`[ConversationFinalizer] No inactive conversations found`);
        return 0;
      }

      console.log(`[ConversationFinalizer] Found ${inactiveConversations.length} inactive conversations to finalize`);

      let finalized = 0;
      for (const conv of inactiveConversations) {
        const result = await this.finalizeConversation(conv.id);
        if (result) {
          finalized++;
        }
      }

      console.log(`[ConversationFinalizer] ✅ Finalized ${finalized}/${inactiveConversations.length} conversations`);
      return finalized;
    } catch (error: any) {
      console.error(`[ConversationFinalizer] ❌ Error finding inactive conversations:`, error.message);
      return 0;
    }
  }
}

// Export singleton
export const conversationFinalizer = new ConversationFinalizer();
